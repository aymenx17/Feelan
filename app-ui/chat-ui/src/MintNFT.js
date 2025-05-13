import React from 'react';
import { storeArweave, fetchConversationSummary } from './IrysService';

export const shareNFT = async (Web3, contract, conversationId, config) => {
    if (!Web3 || !contract) {
        console.log("Web3 or contract not initialized.");
        return;
    }

    try {
        const accounts = await Web3.eth.getAccounts();
        if (accounts.length === 0) {
            console.log("No accounts found. Make sure MetaMask is connected.");
            return;
        }

        const name = conversationId; // Adjusted for meaningful NFT names
        const maxSupply = 40;
        const collectionId = parseInt(conversationId.split('-')[1], 10);
        const userId = accounts[0];

        const conversation = await fetchConversationSummary(conversationId, userId, config);
        const stringifiedConv = JSON.stringify(conversation, null, 2); // For readability
        const arweaveConv = await storeArweave(stringifiedConv);
        const convURI = arweaveConv.receipt.replace('/graphql', ''); // This will be used as tokenURI for minting

        const summary = conversation.summary; // Or however you retrieve the summary

        const nftMetadata = {
            description: "This is the tokenURI for minting the NFT",
            image: convURI, // Assuming this is the arweaveURL you mentioned
            name: name, // Using conversation name as NFT name
            attributes: [
                {
                    userId: userId,
                    summary: summary // Assuming you have userId in your conversation object
                }]
        };

        const metadataStringified = JSON.stringify(nftMetadata);
        const arweaveResponse = await storeArweave(metadataStringified);
        const tokenURI = arweaveResponse.receipt.replace('/graphql', ''); // This will be used as tokenURI for minting

        const gasPrice = await Web3.eth.getGasPrice();
        const tx = await contract.methods.createCollectionAndMint(collectionId, name, maxSupply, accounts[0], tokenURI)
            .send({
                from: accounts[0],
                gasPrice: Web3.utils.toWei('50', 'gwei'), // You can adjust this value
                gas: 500000 // You can adjust this value based on the contract method's complexity
            });

        console.log('Minting transaction sent. Transaction Hash:', tx.transactionHash);

        // Wait for the transaction to be confirmed
        const receipt = await Web3.eth.getTransactionReceipt(tx.transactionHash);
        if (receipt.status) {
            console.log('Transaction confirmed. Block Number:', receipt.blockNumber);
            console.log("NFT minted successfully.");
            return tokenURI;
        } else {
            console.error("Transaction failed.");
        }

    } catch (error) {
        console.error("Failed to mint NFT:", error);
    }
};
