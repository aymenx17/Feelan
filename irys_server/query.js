const { dryrun } = require('@permaweb/aoconnect');

const ARWEAVE_WALLET = "AyhDJl1T16qJE1iksd_EgyMjdzXqZ8YuSAJGss1M4iY";

const readMessages = async (baseId) => {
    try {
        const dr_result = await dryrun({
            process: baseId,
            data: "require('json').encode(Inbox_data, { indent = true })",
            Owner: ARWEAVE_WALLET,
            tags: [{ name: "Action", value: "Eval" }]
        });

        const inbox_data = JSON.parse(dr_result.Output.data.output);

        return inbox_data
            .filter(message => !message.executed)
            .map(message => ({
                Id: message.id,
                Timestamp: parseInt(message.timestamp, 10),
                Data: message.data,
                From: message.from ?? "Unknown",
                ReadableTime: new Date(parseInt(message.timestamp, 10)).toLocaleString()
            }));
    } catch (error) {
        console.error('Error reading messages:', error);
        throw new Error(`Failed to read messages: ${error.message}`);
    }
};

module.exports = { readMessages };
