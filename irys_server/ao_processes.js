// ao_processes.js
const { createDataItemSigner, spawn, result, dryrun, message, monitor, unmonitor } = require('@permaweb/aoconnect');
const { readFileSync } = require('fs');

// Constants
const ARWEAVE_WALLET = "AyhDJl1T16qJE1iksd_EgyMjdzXqZ8YuSAJGss1M4iY";
const FEELAN = "fFHf9C18ty22vHcTIzDlTVcLc489mTnzdpaDmZYW5tE";

// Load wallet configuration
const wallet = JSON.parse(readFileSync('./wallet.json').toString());

/**
 * Spawns a new AO process with the given tags
 * @param {Array} tags - Array of tag objects with name and value properties
 * @returns {Promise<string>} The process ID
 * @throws {Error} If process spawning fails
 */
const spawnProcess = async (tags) => {
    try {
        const processId = await spawn({
            module: "cNlipBptaF9JeFAf4wUmpi43EojNanIBos3EfNrEOWo",
            scheduler: "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA",
            signer: createDataItemSigner(wallet),
            tags: tags,
        });
        return processId;
    } catch (error) {
        throw new Error(`Failed to spawn process: ${error.message}`);
    }
};

/**
 * Sends a message to an AO process
 * @param {string} processId - The target process ID
 * @param {string} messageData - The message data to send
 * @param {string} action - The action to perform
 * @returns {Promise<string>} The message ID
 * @throws {Error} If message sending fails
 */
const sendMessage = async (processId, messageData, action) => {
    try {
        const messageId = await message({
            process: processId,
            tags: [{ name: "Action", value: action }],
            signer: createDataItemSigner(wallet),
            data: messageData,
        });
        return messageId;
    } catch (error) {
        throw new Error(`Failed to send message: ${error.message}`);
    }
};

/**
 * Saves chat data to the system
 * @param {Object} payload - The chat data to save
 * @returns {Promise<Object>} The saved chat data
 */
const saveChat = async (payload) => {
    try {
        console.log(`Saving chat with ID: ${payload.id}`);
        return payload;
    } catch (error) {
        throw new Error(`Failed to save chat: ${error.message}`);
    }
};

/**
 * Creates a new AO process with the given address and tags
 * @param {string} address - The user's address
 * @param {Array} tags - Array of tag objects
 * @returns {Promise<Object>} Object containing processId and name
 * @throws {Error} If process creation fails
 */
const createProcess = async (address, tags) => {
    try {
        // Add the user tag
        const processTags = [...tags, { name: "Pol-User", value: address }];
        
        // Spawn the process
        const processId = await spawnProcess(processTags);
        
        // Get the process name from tags
        const name = processTags.find(item => item.name === 'Name')?.value;
        
        // Prepare and send the process creation message
        const messageData = {
            processId,
            name,
            tags: processTags
        };
        
        await sendMessage(FEELAN, JSON.stringify(messageData), "New-Process");
        
        return { processId, name };
    } catch (error) {
        throw new Error(`Failed to create process: ${error.message}`);
    }
};

/**
 * Queries an AO process with the given query
 * @param {string} processId - The process ID to query
 * @param {string} query - The query to execute
 * @returns {Promise<string>} The query result
 * @throws {Error} If query execution fails
 */
const queryProcess = async (processId, query) => {
    try {
        const dr_result = await dryrun({
            process: processId,
            data: query,
            Owner: ARWEAVE_WALLET,
            tags: [{ name: "Action", value: "Eval" }]
        });
        
        return dr_result.Output.data.output.toString();
    } catch (error) {
        throw new Error(`Failed to query process: ${error.message}`);
    }
};

/**
 * Runs code in an AO process
 * @param {string} processId - The process ID to run code in
 * @param {string} code - The code to execute
 * @returns {Promise<string>} The message ID
 * @throws {Error} If code execution fails
 */
const runProcess = async (processId, code) => {
    try {
        return await sendMessage(processId, code, "Eval");
    } catch (error) {
        throw new Error(`Failed to run process: ${error.message}`);
    }
};

/**
 * Gets all processes for a given address
 * @param {string} address - The address to get processes for
 * @returns {Promise<Array>} Array of processes
 * @throws {Error} If process retrieval fails
 */
const getProcesses = async (address) => {
    try {
        const dr_result = await dryrun({
            process: FEELAN,
            data: "require('json').encode(user_processes, { indent = true })",
            Owner: ARWEAVE_WALLET,
            tags: [{ name: "Action", value: "Eval" }]
        });
        
        const userProcesses = JSON.parse(dr_result.Output.data.output)[address];
        return userProcesses || [];
    } catch (error) {
        throw new Error(`Failed to get processes: ${error.message}`);
    }
};

module.exports = {
    getProcesses,
    createProcess,
    queryProcess,
    runProcess,
    sendMessage,
    saveChat
};
