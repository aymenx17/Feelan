// mint.js
const { ethers } = require('ethers');
require('dotenv').config();
const UserContractABI = require('./UserContractABI.json');

const { createWalletClient, http } = require('viem');
const { polygon } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const { createPublicClient } = require('viem');

// Constants
const API_URL = process.env.API_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.USER_CONTRACT_ADDRESS;

// Initialize account
const account = privateKeyToAccount(PRIVATE_KEY);

// Initialize clients
const walletClient = createWalletClient({
    chain: polygon,
    chainId: polygon.id,
    account: account,
    transport: http(API_URL)
});

const provider = new ethers.providers.JsonRpcProvider(API_URL, polygon.id);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, UserContractABI, wallet);
const maticProvider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');

/**
 * Mints a new NFT with the given metadata URI
 * @param {string} recipientAddress - The address to mint the NFT to
 * @param {string} metadataUri - The metadata URI for the NFT
 * @returns {Promise<string>} The token ID of the minted NFT
 * @throws {Error} If minting fails
 */
const mintNFT = async (recipientAddress, metadataUri) => {
    try {
        // Estimate gas with buffer
        const estimatedGas = await contract.estimateGas.safeMint(recipientAddress, metadataUri);
        const gasLimit = estimatedGas.add(ethers.BigNumber.from("50000"));

        // Get gas price with 10% increase for faster confirmation
        const gasPrice = await provider.getGasPrice();
        const enhancedGasPrice = gasPrice.mul(ethers.BigNumber.from("110")).div(ethers.BigNumber.from("100"));

        // Execute mint transaction
        const tx = await contract.safeMint(recipientAddress, metadataUri, {
            gasLimit: gasLimit.toString(),
            gasPrice: enhancedGasPrice.toString()
        });

        console.log('Minting transaction sent:', tx.hash);

        // Wait for transaction confirmation
        const receipt = await tx.wait();
        console.log('Transaction confirmed in block:', receipt.blockNumber);

        // Extract token ID from transfer event
        const tokenId = receipt.events.find(event => event.event === "Transfer").args.tokenId.toString();
        return tokenId;
    } catch (error) {
        if (error instanceof ethers.errors.TransactionFailed) {
            console.error('Transaction failed:', error.receipt);
        } else {
            console.error('Minting failed:', error);
        }
        throw new Error(`Failed to mint NFT: ${error.message}`);
    }
};

/**
 * Gets the total supply of tokens from the contract
 * @returns {Promise<string>} The total supply as a string
 * @throws {Error} If fetching total supply fails
 */
const getTokenSupply = async () => {
    try {
        const abi = ["function totalSupply() public view returns (uint256)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, maticProvider);
        
        const totalSupply = await contract.totalSupply();
        console.log(`Total Supply: ${totalSupply.toString()}`);
        
        return totalSupply.toString();
    } catch (error) {
        console.error(`Error fetching total supply: ${error.message}`);
        throw new Error(`Failed to get token supply: ${error.message}`);
    }
};

module.exports = {
    mintNFT,
    getTokenSupply
};
