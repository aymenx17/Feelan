const cron = require('node-cron');
const { ethers } = require('ethers');
require('dotenv').config(); // Ensure environment variables are loaded
const QuoterABI = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json');


const fs = require('fs');
const { createDataItemSigner, result,  message } = require('@permaweb/aoconnect');



const chainId = 137;
const provider = new ethers.providers.JsonRpcProvider(process.env.API_URL, chainId);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const UNISWAP_QUOTER_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
const ERC20_abi = require('./ERC20_abi.json'); // Adjust the path
const noraId = 'huh62dyyOfaxHs7YE5Y8_xv_M57TXYsBWvFxsTXsItE';

const wallet = JSON.parse(
    fs.readFileSync('./wallet.json').toString()
  );

/**
 * Gets token details and balance for a wallet
 * @param {ethers.Contract} contract - ERC20 token contract
 * @param {number} chainId - Chain ID of the network
 * @param {string} walletAddress - Address to check balance for
 * @returns {Object} Token details and balance
 */
async function getTokenDetailsAndBalance(contract, chainId, walletAddress) {
    const token = await contract.functions.symbol();
    const balance = await contract.balanceOf(walletAddress);
    const decimals = await contract.decimals();
    return {
        token: {
            symbol: token,
            decimals: decimals
        },
        balance: ethers.utils.formatUnits(balance, decimals)
    };
}

/**
 * Gets USD value for a list of tokens
 * @param {Array} tokenDetails - Array of token details objects
 * @param {string} walletAddress - Wallet address to check
 * @returns {Array} Array of token price data
 */
async function getUSDvalue(tokenDetails, walletAddress) {
    try {
        const quoterContract = new ethers.Contract(UNISWAP_QUOTER_ADDRESS, QuoterABI.abi, provider);

        const results = await Promise.all(tokenDetails.map(async (token) => {
            try {
                // Get token details for input token
                const contractIn = new ethers.Contract(token.tokenInAddress, ERC20_abi, signer);
                const tokenIn = await getTokenDetailsAndBalance(contractIn, chainId, walletAddress);
                
                // Get token details for output token (USDT)
                const contractOut = new ethers.Contract(token.tokenOutAddress, ERC20_abi, signer);
                const tokenOut = await getTokenDetailsAndBalance(contractOut, chainId, walletAddress);

                // Parse input amount
                const amountInBn = ethers.utils.parseUnits(token.tokenInAmount.toString(), tokenIn.token.decimals);

                // Get quote from Uniswap
                const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
                    token.tokenInAddress,
                    token.tokenOutAddress,
                    3000,  // 0.3% fee tier
                    amountInBn,
                    0
                );

                // Format the result
                const usdValue = ethers.utils.formatUnits(quotedAmountOut, tokenOut.token.decimals);

                return {
                    tokenInSymbol: token.tokenInSymbol,
                    usdValue: usdValue
                };
            } catch (innerError) {
                console.error(`Error fetching price for ${token.tokenInSymbol}:`, innerError);
                return {
                    tokenInSymbol: token.tokenInSymbol,
                    usdValue: null,
                    error: `Error fetching price for ${token.tokenInSymbol}`
                };
            }
        }));

        return results;
    } catch (error) {
        console.error("Error fetching prices:", error);
        return [];
    }
}

/**
 * Sends a message to AO with price data
 * @param {string} messageData - JSON string of price data to send
 * @returns {string} Message ID
 */
const sendMessage = async (messageData) => {
    const messageId = await message({
        process: noraId,
        tags: [
            { name: "Action", value: "Price-Data" },
        ],
        signer: createDataItemSigner(wallet),
        data: messageData,
    });

    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    const resultData = await result({
        message: messageId,
        process: noraId,
    });

    const output = resultData.Output?.data?.output ?? undefined;
    return messageId;
};

/**
 * Starts a cron job to fetch and store price data every minute
 * Fetches prices for specified tokens and sends to AO process
 */
const startPriceCronJob = () => {
    cron.schedule('* * * * *', async () => {
        const walletAddress = "0x39CfBFeCEBb47833393Fd4a8Ce69894D53158A05";
        const tokenList = ["UNI", "WMATIC", "WETH"];

        // Read token data from valid_tokens.json
        const validTokens = JSON.parse(fs.readFileSync('valid_tokens.json').toString());

        // Prepare token details for price checking
        const tokenDetails = tokenList.map(symbol => {
            const token = validTokens.find(t => t.symbol === symbol);
            return {
                tokenInAddress: token.address,
                tokenOutAddress: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT on Polygon
                tokenInSymbol: token.symbol,
                tokenInAmount: "1.0" // Amount for price calculation
            };
        });
        
        // Fetch prices and send to AO
        const results = await getUSDvalue(tokenDetails, walletAddress);
        const messageData = JSON.stringify(results);
        const messageId = await sendMessage(messageData);
    });
};

module.exports = { startPriceCronJob };
