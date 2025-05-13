const cron = require('node-cron');
const { readMessages } = require('./query');
const { sendMessage } = require('./ao_processes');
const { performSwap } = require('./uniswap');
const path = require('path');
const fs = require('fs');

// Constants
const BASE_ID = "PCWYFhkCnwsXF3iXgN3Uo6YLewCW8YE0DJ0qJorhu7Q";
const VALID_TOKENS_PATH = path.join('./valid_tokens.json');
const CRON_SCHEDULE = '*/10 * * * * *'; // Every 10 seconds

let lastMessageCount = 0;

/**
 * Shortens a process ID for cleaner logging
 * @param {string} id - Process ID to shorten
 * @returns {string} Shortened ID
 */
const shortenId = (id) => {
    return id.length > 10 ? `${id.substring(0, 5)}...${id.substring(id.length - 5)}` : id;
};

/**
 * Rounds a number to a specified number of decimal places
 * @param {number} num - Number to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} Rounded number
 */
const roundDecimals = (num, decimals) => {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
};

/**
 * Gets a token address by its symbol
 * @param {Array} tokens - Array of token objects
 * @param {string} symbol - Token symbol to look up
 * @returns {string|null} Token address or null if not found
 */
const getTokenAddressBySymbol = (tokens, symbol) => {
    const token = tokens.find(t => t.symbol === symbol);
    return token ? token.address : null;
};

/**
 * Execute a token swap based on message data
 * @param {Object} message - Message containing swap instructions
 * @returns {Promise<Object>} Swap result
 * @throws {Error} If swap execution fails
 */
const executeSwap = async (message) => {
    try {
        const { account, operation, price, symbol, amount, id, timestamp } = message;
        const chainId = 137; // Polygon
        const baseTokenSymbol = 'USDT';

        // Read valid tokens
        const validTokens = JSON.parse(fs.readFileSync(VALID_TOKENS_PATH, 'utf8'));

        // Get token addresses
        let tokenInAddress, tokenOutAddress;
        if (operation === 'sell') {
            tokenInAddress = getTokenAddressBySymbol(validTokens, symbol);
            tokenOutAddress = getTokenAddressBySymbol(validTokens, baseTokenSymbol);
        } else if (operation === 'buy') {
            tokenInAddress = getTokenAddressBySymbol(validTokens, baseTokenSymbol);
            tokenOutAddress = getTokenAddressBySymbol(validTokens, symbol);
        } else {
            throw new Error(`Invalid operation: ${operation}`);
        }

        if (!tokenInAddress || !tokenOutAddress) {
            throw new Error(`Invalid token symbol: ${symbol} or ${baseTokenSymbol}`);
        }

        // Calculate amount
        const amountIn = operation === 'sell' 
            ? roundDecimals(parseFloat(amount), 3).toString()
            : roundDecimals(parseFloat(amount) / parseFloat(price), 3).toString();

        // Prepare swap request
        const req = {
            body: {
                chainId,
                walletAddress: account,
                tokenInAddress,
                tokenOutAddress,
                amountIn
            }
        };

        // Mock response object for logging
        const res = {
            status: (code) => ({
                send: (message) => console.log(`Response Code: ${code}, Message: ${message}`),
                json: (message) => console.log(`Response Code: ${code}, JSON Message: ${JSON.stringify(message)}`)
            })
        };

        return await performSwap(req, res);
    } catch (error) {
        console.error(`Error in swap execution: ${error.message}`);
        throw new Error(`Failed to execute swap: ${error.message}`);
    }
};

/**
 * Process an individual message from AO
 * @param {Object} msg - Message object to process
 * @returns {Promise<void>}
 */
const processMessage = async (msg) => {
    try {
        const messageData = JSON.parse(msg.Data);
        messageData.id = msg.Id;
        messageData.timestamp = msg.Timestamp;

        const swapResult = await executeSwap(messageData);
        
        const messageDataString = JSON.stringify(messageData);
        await sendMessage(BASE_ID, messageDataString, "Executed");
        
        console.log(`Operation executed: ${messageDataString}`);
    } catch (error) {
        console.error('Failed to process message:', error);
    }
};

/**
 * Retrieves messages from AO
 * @param {string} aoAddress - AO process address
 * @returns {Promise<Array>} Array of messages
 */
const getMessages = async (aoAddress) => {
    try {
        return await readMessages(aoAddress);
    } catch (error) {
        console.error('Error fetching messages:', error);
        throw error;
    }
};

/**
 * Starts a cron job to periodically check for new messages
 * Runs every 10 seconds, processes new messages when found
 */
const startCronJob = () => {
    cron.schedule(CRON_SCHEDULE, async () => {
        try {
            const messages = await getMessages(BASE_ID);
            
            if (messages.length > lastMessageCount) {
                const newMessages = messages.slice(lastMessageCount);
                console.log(`New messages: ${newMessages.length}`);
                
                for (const msg of newMessages) {
                    console.log(`New message from ${shortenId(msg.From)} Data: ${msg.Data} Sent on ${msg.ReadableTime}`);
                    await processMessage(msg);
                }
                
                lastMessageCount = messages.length;
            }
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        }
    });
};

module.exports = { startCronJob };
