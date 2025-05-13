const express = require('express');
const cors = require('cors');
const Irys = require('@irys/sdk');
const JSZip = require('jszip');
const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch'); 
require('dotenv').config();
// const { Query } = require("@irys/query");
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });



const ethers = require('ethers');
const { Token, CurrencyAmount, Percent, TradeType } = require('@uniswap/sdk-core');
const { Pool } = require('@uniswap/v3-sdk');
const { AlphaRouter } = require('@uniswap/smart-order-router');
const { BigNumber } = require('@ethersproject/bignumber');
const ERC20_abi = require('./ERC20_abi.json');
const QuoterABI = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json');
const IUniswapV3Pool = require('@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json');
const IUniswapV3Factory = require('@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json');
const { createWalletClient, http, getAddress, parseUnits, custom } = require('viem');
const { polygon } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
const { WalletClient, Provider, createPublicClient } = require('viem');
const { TokenboundClient } = require('@tokenbound/sdk');
const { Alchemy, Network } = require('alchemy-sdk');

const { mintNFT, getTokenSupply } = require('./mint');
const { generateMetadataUri } = require('./utils');
const assert = require('assert');

const { abi: V3SwapRouterABI } = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/ISwapRouter.sol/ISwapRouter.json');
const { abi: PeripheryPaymentsABI } = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/IPeripheryPayments.sol/IPeripheryPayments.json');
const { abi: MulticallABI } = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/IMulticall.sol/IMulticall.json');


const { getProcesses, createProcess, queryProcess, runProcess, saveChat } = require('./ao_processes');
const { startCronJob } = require('./Inbox'); // Import the cron job
const { startPriceCronJob } = require('./priceFetcher'); // Import the cron job from priceFetcher

const {performSwap} = require('./uniswap');



const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;

const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'; // '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
const UNISWAP_QUOTER_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
const tokenContractAddress = '0x68a8bbfcecc2BC751b99a107E03a73eAc2A31d58';

const parentAccount = privateKeyToAccount(process.env.PRIVATE_KEY);
const API_URL =  process.env.API_URL;
const parentAddress = parentAccount.address;



const provider = new ethers.providers.JsonRpcProvider(process.env.API_URL, polygon.id);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);


// Initialize clients once
const publicClient = createPublicClient({
    chain: polygon,
    chainId: polygon.id,
    transport: http(API_URL)
});

const walletClient = createWalletClient({
    chain: polygon,
    chainId: polygon.id,
    account: parentAccount,
    transport: http(API_URL)
});

const tokenboundClient = new TokenboundClient({ walletClient, chainId: polygon.id });

const swapRouterContract = new ethers.Contract(
    V3_SWAP_ROUTER_ADDRESS,
    V3SwapRouterABI.concat(PeripheryPaymentsABI).concat(MulticallABI)
  );
  


// Helper function to get token details and balance
async function getTokenDetailsAndBalance(contract, chainId, walletAddress) {
    const [decimals, symbol, name, balance] = await Promise.all([
        contract.decimals(),
        contract.symbol(),
        contract.name(),
        contract.balanceOf(walletAddress)
    ]);

    return {
        token: new Token(chainId, contract.address, decimals, symbol, name),
        balance
    };
}

// Helper function to count the number of accounts
async function countAccounts(walletAddress) {
    const config = {
        apiKey: process.env.ALCHEMY_API_KEY,
        network: Network.MATIC_MAINNET  // Use the correct network for Polygon mainnet
    };
    const alchemy = new Alchemy(config);

    const nfts = await alchemy.nft.getNftsForOwner(walletAddress);
    const contractAddress = tokenContractAddress;

    const filteredNfts = nfts.ownedNfts.filter(nft =>
        nft.contract.address.toLowerCase() === contractAddress.toLowerCase()
    );

    return filteredNfts.length;
}

/**
 * API endpoint to return NFT ownership to original wallet
 * @route POST /getOwnership
 * @param {Object} req.body.tokenboundAddress - The tokenbound account address
 * @returns {Object} Transaction hash and future owner address
 */
app.post('/getOwnership', async (req, res) => {
    try {
        console.log("Passing ownership back")
        const { tokenboundAddress } = req.body;

        // Fetch the NFT details using the tokenbound address
        const nft = await tokenboundClient.getNFT({
            accountAddress: tokenboundAddress
        });

        const { tokenContract, tokenId, chainId } = nft;

        // Use Alchemy to get NFTs owned by the current wallet address
        const config = {
            apiKey: process.env.ALCHEMY_API_KEY,
            network: Network.MATIC_MAINNET  // Use the correct network for Polygon mainnet
        };
        const alchemy = new Alchemy(config);

        // Replace with the actual wallet address that owns the NFTs
        //const walletAddress = req.body.walletAddress;

        const nfts = await alchemy.nft.getNftsForContract(tokenContract);

        // Filter the NFTs by tokenContract and tokenId
        const filteredNft = nfts.nfts.find(nft =>
            nft.contract.address.toLowerCase() === tokenContract.toLowerCase() &&
            nft.tokenId === tokenId
        );

        if (!filteredNft) {
            return res.status(404).json({ error: 'NFT not found' });
        }

        // Read the future owner's address from the NFT's tokenUri
        const tokenURI = filteredNft.raw.tokenUri;
        const futureOwnerAddress = JSON.parse(tokenURI).walletAddress;



        // ABI encoding for the transferFrom method
        const transferFromAbi = [
            "function transferFrom(address from, address to, uint256 tokenId) external"
        ];

        const iface = new ethers.utils.Interface(transferFromAbi);
        const data = iface.encodeFunctionData("transferFrom", [parentAddress, futureOwnerAddress, tokenId]);


        // Transfer the NFT to the future owner
        const txHash = await walletClient.sendTransaction({
            to: tokenContract,
            value: 0,
            data: data
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status === 0) {
            throw new Error("NFT transfer failed");
        }
        // const txHash = transaction.hash;
        console.log("NFT transfered", txHash)

        res.status(200).json({ txHash, futureOwnerAddress });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});


/**
 * API endpoint to save chat data to AO process
 * @route POST /save-chat
 * @param {Object} req.body.payload - Chat data to save
 * @returns {Object} Result from AO process
 */
app.post('/save-chat', async (req, res) => {
    const { payload } = req.body;
    try {
        const result = await saveChat(payload);
        res.status(200).send({ result });
    } catch (error) {
        res.status(500).send({ error: 'An error occurred while creating a process.' });
    }
});


/**
 * API endpoint to create a new AO process
 * @route POST /createProcess
 * @param {Object} req.body.processName - Name of the process
 * @param {Object} req.body.processDescription - Description of the process
 * @param {Object} req.body.walletAddress - Owner wallet address
 * @param {Object} req.body.accessToken - Authentication token
 * @returns {Object} Result from AO process creation
 */
app.post('/createProcess', async (req, res) => {
    const { address, tags } = req.body;
    try {
        const process = await createProcess(address, tags);
        res.status(200).send({ process });
    } catch (error) {
        res.status(500).send({ error: 'An error occurred while creating a process.' });
    }
});



/**
 * API endpoint to query an AO process
 * @route POST /queryProcess
 * @param {Object} req.body.processId - ID of the process to query
 * @param {Object} req.body.query - Query to execute
 * @param {Object} req.body.accessToken - Authentication token
 * @returns {Object} Query result
 */
app.post('/queryProcess', async (req, res) => {
    const { processId, query } = req.body;
    try {
        const result = await queryProcess(processId, query);
        res.status(200).send({ result });
    } catch (error) {
        res.status(500).send({ error: 'An error occurred while creating a process.' });
    }
});


/**
 * API endpoint to run code in an AO process
 * @route POST /runProcess
 * @param {Object} req.body.processId - ID of the process
 * @param {Object} req.body.code - Code to execute
 * @param {Object} req.body.accessToken - Authentication token
 * @returns {Object} Execution result
 */
app.post('/runProcess', async (req, res) => {
    const { processId, code } = req.body;
    try {
        const result = await runProcess(processId, code);
        res.status(200).send({ result });
    } catch (error) {
        res.status(500).send({ error: 'An error occurred while creating a process.' });
    }
});


/**
 * API endpoint to get AO processes for a wallet
 * @route POST /getProcesses
 * @param {Object} req.body.walletAddress - Wallet address
 * @param {Object} req.body.accessToken - Authentication token
 * @returns {Object} List of processes
 */
app.post('/getProcesses', async (req, res) => {
    const { address } = req.body;
    try {
        const processes = await getProcesses(address);
        res.status(200).send({ processes });
    } catch (error) {
        res.status(500).send({ error: 'An error occurred while fetching processes.' });
    }
});


/**
 * API endpoint to create a new TokenBound account
 * @route POST /createAccount
 * @param {Object} req.body.address - Wallet address to create account for
 * @returns {Object} Account address and transaction hash
 */
app.post('/createAccount', async (req, res) => {
    try {
        const { address, name, description } = req.body;
        

        const tokenId = await getTokenSupply();

        const account = await tokenboundClient.getAccount({
            tokenContract: tokenContractAddress,
            tokenId: tokenId,
        });

        // Generate metadata URI
        const metadataUri = await generateMetadataUri(address, account, name, description);
        // Mint the NFT using the generated metadata URI
        const tokenId_minted = await mintNFT(address, metadataUri);

        assert.strictEqual(tokenId, tokenId_minted, 'The tokenId is not right');

        
        const preparedAccount = await tokenboundClient.prepareCreateAccount({
            tokenContract: tokenContractAddress,
            tokenId: tokenId,
        });
        
        const { to, value, data } = preparedAccount;
        const txHash = await walletClient.sendTransaction({
            to: to,
            value: value,
            data: data
        });
        
        console.log(txHash);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        if (receipt.status === 0) {
            throw new Error("Account creation failed");
        }





        res.status(200).json({ account, txHash });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/fetchAccounts', async (req, res) => {
    try {
        const walletAddress = req.body.walletAddress;
        const tokenIdThreshold = 18; // Only include tokenIds greater than this value
        const accounts = [];
        const config = {
            apiKey: process.env.ALCHEMY_API_KEY,
            network: Network.MATIC_MAINNET // Adjust as necessary
        };
        const alchemy = new Alchemy(config);
        const contractAddress = tokenContractAddress;

        // Fetch all NFTs for a given contract
        const nfts = await alchemy.nft.getNftsForContract(contractAddress);

        // Process each NFT to extract metadata and filter based on conditions
        for (let nft of nfts.nfts) {
            // Check if tokenId is greater than the threshold
            const tokenId = parseInt(nft.tokenId);
            if (tokenId > tokenIdThreshold && nft.contract.address.toLowerCase() === contractAddress.toLowerCase()) {
                try {
                    const rawMetadata = nft.raw.tokenUri; // Assuming raw tokenUri is the correct property
                    const metadata = JSON.parse(rawMetadata);

                    // Further filter based on walletAddress in metadata if it's used in the metadata structure
                    if (metadata.walletAddress && metadata.walletAddress === walletAddress) {
                        const account = await tokenboundClient.getAccount({
                            tokenContract: contractAddress,
                            tokenId: nft.tokenId,
                        });

                        // Only add to accounts if the account retrieval is successful
                        accounts.push({
                            accountAddress: metadata.accountAddress, // Adjust based on the actual response structure
                            name: metadata.name,
                            description: metadata.description
                        });
                    }
                } catch (error) {
                    console.error(`Failed to parse metadata for tokenId ${nft.tokenId}: ${error}`);
                }
            }
        }

        res.status(200).json({ accounts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});


app.post('/tokenListBalance', async (req, res) => {
    try {
        const { chainId, walletAddress, tokenAddresses } = req.body;

        if (!Array.isArray(tokenAddresses)) {
            return res.status(400).json({ error: "tokenAddresses should be an array" });
        }

        const results = [];

        for (const token of tokenAddresses) {
            const { symbol, address } = token;
            const contract = new ethers.Contract(address, ERC20_abi, signer);
            // Retrieve balance
            const balance = await contract.balanceOf(walletAddress);
            // Retrieve decimals
            const decimals = await contract.decimals();
            // Adjust balance based on decimals
            const adjustedBalance = ethers.utils.formatUnits(balance, decimals);

            // Append result as a formatted string
            results.push(`${symbol}: ${adjustedBalance} tokens`);
        }

        // Join results into a single string
        const resultString = results.join('\n');

        res.status(200).send(resultString);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});





app.post('/balance', async (req, res) => {
    try {
        const { chainId, walletAddress, tokenInAddress, tokenOutAddress } = req.body;

        const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);
        const contractOut = new ethers.Contract(tokenOutAddress, ERC20_abi, signer);

        const tokenIn = await getTokenDetailsAndBalance(contractIn, chainId, walletAddress);
        const tokenOut = await getTokenDetailsAndBalance(contractOut, chainId, walletAddress);

        res.status(200).json({
            [tokenIn.token.symbol]: ethers.utils.formatUnits(tokenIn.balance, tokenIn.token.decimals),
            [tokenOut.token.symbol]: ethers.utils.formatUnits(tokenOut.balance, tokenOut.token.decimals)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/transferERC20', async (req, res) => {
    try {
        const { accountAddress, tokenInAddress, amount, recipient } = req.body;

        const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);
        const tokenIn = await getTokenDetailsAndBalance(contractIn, polygon.id, accountAddress);

        console.log('Sending:', { accountAddress, tokenInAddress, amount, recipient });

        const transferERC20 = await tokenboundClient.transferERC20({
            account: accountAddress,
            amount: amount,
            recipientAddress: recipient,
            erc20tokenAddress: tokenInAddress,
            erc20tokenDecimals: tokenIn.token.decimals,
        });

        console.log('Transfer result:', transferERC20);
        res.json({ success: true, result: transferERC20 });
    } catch (error) {
        console.error('Error sending tokens:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});



async function multiSwap(req, res) {
    try {
        const swaps = req.body.swaps; // Expecting an array of swap objects

        // Initialize an array to collect all calldata
        let calls = [];
        const tokenboundClient = new TokenboundClient({ walletClient, chainId: polygon.id });
        const swapRouterContract = new ethers.Contract(
            V3_SWAP_ROUTER_ADDRESS,
            V3SwapRouterABI.concat(PeripheryPaymentsABI).concat(MulticallABI)
          );

        // Aggregate the total amounts for each distinct tokenInAddress
        const approveAmounts = {};
        const tokenDecimals = {};
        const tokenDetailsMap = {};
        const chainId = 137;

        for (const swap of swaps) {
            const { tokenInAddress, amountIn } = swap;

            if (!approveAmounts[tokenInAddress]) {
                approveAmounts[tokenInAddress] = ethers.BigNumber.from(0);
                
                // Fetch the token details to get decimals
                const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);
                const tokenIn = await getTokenDetailsAndBalance(contractIn, chainId, swap.walletAddress);
                tokenDecimals[tokenInAddress] = tokenIn.token.decimals;
            }

            approveAmounts[tokenInAddress] = approveAmounts[tokenInAddress].add(ethers.utils.parseUnits(amountIn, tokenDecimals[tokenInAddress]));
        }

        // Approve each distinct tokenInAddress with the aggregated amount
        for (const tokenInAddress in approveAmounts) {
            const approveAmount = approveAmounts[tokenInAddress];
            const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);

            console.log(`Approving ${ethers.utils.formatUnits(approveAmount, tokenDecimals[tokenInAddress])} tokens for ${tokenInAddress}`);

            const dataApp = contractIn.interface.encodeFunctionData("approve", [V3_SWAP_ROUTER_ADDRESS, approveAmount]);

            const tokenApprove = {
                account: swaps[0].walletAddress, // Use the walletAddress from the first swap object
                to: tokenInAddress,
                value: ethers.constants.Zero,
                data: dataApp
            };

            const approvalCall = await tokenboundClient.execute(tokenApprove);
            console.log(approvalCall);

            const receiptA = await publicClient.waitForTransactionReceipt(
                { hash: approvalCall, timeout: 30_000 }
            );

            if (receiptA.status === 0) {
                throw new Error("Approval failed");
            }

            console.log("Approved");
        }

  

        // Collect calldata for each swap
        for (const swap of swaps) {
            const { walletAddress, tokenInAddress, tokenOutAddress, amountIn } = swap;

            const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);
            const contractOut = new ethers.Contract(tokenOutAddress, ERC20_abi, signer);

            const isValidSigner = await tokenboundClient.isValidSigner({
                account: walletAddress,
            });
            console.log('isValidSigner?', isValidSigner);

            // Retrieve token details and balances
            const tokenIn = await getTokenDetailsAndBalance(contractIn, chainId, walletAddress);
            const tokenOut = await getTokenDetailsAndBalance(contractOut, chainId, walletAddress);
            // Store token details for later balance update
            tokenDetailsMap[tokenInAddress] = tokenIn;
            tokenDetailsMap[tokenOutAddress] = tokenOut;


            console.log(`Wallet ${walletAddress} balances:`);
            console.log(`   Input: ${tokenIn.token.symbol} (${tokenIn.token.name}): ${ethers.utils.formatUnits(tokenIn.balance, tokenIn.token.decimals)}`);
            console.log(`   Output: ${tokenOut.token.symbol} (${tokenOut.token.name}): ${ethers.utils.formatUnits(tokenOut.balance, tokenOut.token.decimals)}`);
            console.log("");

            console.log("Loading up quote for a swap...");
            const amountInBn = ethers.utils.parseUnits(amountIn, tokenIn.token.decimals);

            // Uniswap quoter contract for getting a quote
            const quoterContract = new ethers.Contract(UNISWAP_QUOTER_ADDRESS, QuoterABI.abi, provider);
            const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
                tokenIn.token.address,
                tokenOut.token.address,
                3000, // Assuming a fixed fee tier of 0.3%; adapt as needed
                amountInBn,
                0 // No price limit
            );

            console.log(`   You'll get approximately ${ethers.utils.formatUnits(quotedAmountOut, tokenOut.token.decimals)} ${tokenOut.token.symbol} for ${amountIn} ${tokenIn.token.symbol}`);
            console.log("");

            console.log("Loading a swap route...");

            const inAmount = CurrencyAmount.fromRawAmount(tokenIn.token, amountInBn.toString());
            const router = new AlphaRouter({ chainId: tokenIn.token.chainId, provider: provider });

            const route = await router.route(
                inAmount,
                tokenOut.token,
                TradeType.EXACT_INPUT,
                {
                    recipient: walletAddress,
                    slippageTolerance: new Percent(5, 100), // Big slippage – for a test
                    deadline: Math.floor(Date.now() / 1000 + 1800) // add 1800 seconds – 30 mins deadline
                },
                {
                    maxSwapsPerPath: 1 // only one direct swap for a reason – to avoid issues with DAI overflow
                }
            );

            if (route == null || route.methodParameters === undefined)
                throw "No route loaded";

            console.log(`   You'll get ${route.quote.toFixed()} ${tokenOut.token.symbol}`);
            console.log(`   Gas Adjusted Quote: ${route.quoteGasAdjusted.toFixed()}`);
            console.log(`   Gas Used Quote Token: ${route.estimatedGasUsedQuoteToken.toFixed()}`);
            console.log(`   Gas Used USD: ${route.estimatedGasUsedUSD.toFixed()}`);
            console.log(`   Gas Used: ${route.estimatedGasUsed.toString()}`);
            console.log(`   Gas Price Wei: ${route.gasPriceWei}`);
            console.log('');

            // Collect the calldata for this swap
            calls.push(route.methodParameters.calldata);
        }

        console.log("Executing multicall...");

        const encMulticall = swapRouterContract.interface.encodeFunctionData("multicall", [calls]);
        const txArgs = {
            account: swaps[0].walletAddress, // Use the walletAddress from the first swap object
            to: V3_SWAP_ROUTER_ADDRESS,
            value: ethers.constants.Zero,
            data: encMulticall,
        };

        const tx = await tokenboundClient.execute(txArgs);
        console.log('tx:', tx);

        const receipt = await publicClient.waitForTransactionReceipt(
            { hash: tx , timeout: 20_000 }
        );

        if (receipt.status === 0) {
            throw new Error("Multicall transaction failed");
        }

        console.log("Transaction successful, updating balances...");

        // Update balances for each swap
        let updatedBalances = {};
        for (const swap of swaps) {
            const { walletAddress, tokenInAddress, tokenOutAddress } = swap;
            const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);
            const contractOut = new ethers.Contract(tokenOutAddress, ERC20_abi, signer);

            const tokenIn = tokenDetailsMap[tokenInAddress];
            const tokenOut = tokenDetailsMap[tokenOutAddress];

            const [newBalanceIn, newBalanceOut] = await Promise.all([
                contractIn.balanceOf(walletAddress),
                contractOut.balanceOf(walletAddress)
            ]);

            if (!updatedBalances[walletAddress]) {
                updatedBalances[walletAddress] = {};
            }

            updatedBalances[walletAddress][tokenIn.token.symbol] = ethers.utils.formatUnits(newBalanceIn, tokenIn.token.decimals);
            updatedBalances[walletAddress][tokenOut.token.symbol] = ethers.utils.formatUnits(newBalanceOut, tokenOut.token.decimals);
        }

        console.log('');
        console.log('Multiswap completed successfully!');
        console.log('');
        console.log('Updated balances:', updatedBalances);


        res.status(200).json({
            message: 'Multiswap completed successfully!',
            updatedBalances
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
  
  
/**
 * API endpoint to execute multiple token swaps
 * @route POST /multiSwap
 * @param {Object} req.body.swaps - Array of swap instructions
 * @returns {Object} Results of all swaps
 */
app.post('/multiSwap', multiSwap);



app.post('/getPrice', async (req, res) => {
    try {
        const { chainId, walletAddress, tokenDetails } = req.body;

        const quoterContract = new ethers.Contract(UNISWAP_QUOTER_ADDRESS, QuoterABI.abi, provider);

        const results = await Promise.all(tokenDetails.map(async (token) => {
            try {
                const contractIn = new ethers.Contract(token.tokenInAddress, ERC20_abi, signer);
                const tokenIn = await getTokenDetailsAndBalance(contractIn, chainId, walletAddress);
                const contractOut = new ethers.Contract(token.tokenOutAddress, ERC20_abi, signer);
                const tokenOut = await getTokenDetailsAndBalance(contractOut, chainId, walletAddress);

                const amountInBn = ethers.utils.parseUnits(token.tokenInBalance.toString(), tokenIn.token.decimals);

                const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
                    token.tokenInAddress,
                    token.tokenOutAddress,
                    3000, // Assuming a fixed fee tier of 0.3%; adapt as needed
                    amountInBn,
                    0 // No price limit
                );

                const usdValue = ethers.utils.formatUnits(quotedAmountOut, tokenOut.token.decimals);


                return {
                    tokenInSymbol: token.tokenInSymbol,
                    usdValue: usdValue // Assuming USDT has 18 decimals
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

        res.json(results);
    } catch (error) {
        console.error("Error fetching prices:", error);
        res.status(500).send("Internal Server Error");
    }
});

/**
 * API endpoint to get a quote for token swap
 * @route POST /quote
 * @param {Object} req.body.chainId - Chain ID
 * @param {Object} req.body.walletAddress - Wallet address
 * @param {Object} req.body.tokenInAddress - Input token address
 * @param {Object} req.body.tokenOutAddress - Output token address
 * @param {Object} req.body.amountIn - Amount to swap
 * @returns {Object} Swap quote details
 */
app.post('/quote', async (req, res) => {
    let tokenIn, tokenOut, balanceTokenIn, balanceTokenOut, tokenInSymbol, tokenOutSymbol; // Declare tokenIn and tokenOut outside the try block to make them accessible in the catch block
    try {
        const { chainId, walletAddress, tokenInAddress, tokenOutAddress, amountIn } = req.body;
        console.log("Starting quote retrieval...");
        
        const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);
        tokenIn = await getTokenDetailsAndBalance(contractIn, chainId, walletAddress);

        const contractOut = new ethers.Contract(tokenOutAddress, ERC20_abi, signer);
        tokenOut = await getTokenDetailsAndBalance(contractOut, chainId, walletAddress);

        console.log("Loading up quote for a swap...");
        const amountInBn = ethers.utils.parseUnits(amountIn.toString(), tokenIn.token.decimals);

        // Uniswap quoter contract for getting a quote
        const quoterContract = new ethers.Contract(UNISWAP_QUOTER_ADDRESS, QuoterABI.abi, provider);
        const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
            tokenIn.token.address,
            tokenOutAddress,
            3000, // Assuming a fixed fee tier of 0.3%; adapt as needed
            amountInBn,
            0 // No price limit
        );

        console.log(`   You'll get approximately ${ethers.utils.formatUnits(quotedAmountOut, tokenOut.token.decimals)} tokens for ${amountIn} ${tokenIn.token.symbol}`);
        
        // Further processing...

        console.log("Loading a swap route...");
        const inAmount = CurrencyAmount.fromRawAmount(tokenIn.token, amountInBn.toString());
        const router = new AlphaRouter({ chainId: tokenIn.token.chainId, provider: provider });

        const route = await router.route(
            inAmount,
            tokenOut.token,
            TradeType.EXACT_INPUT,
            {
                recipient: walletAddress,
                slippageTolerance: new Percent(5, 100), // Big slippage – for a test
                deadline: Math.floor(Date.now() / 1000 + 1800) // add 1800 seconds – 30 mins deadline
            },
            {
                maxSwapsPerPath: 1 // only one direct swap for a reason – to avoid issues with DAI overflow
            }
        );

        if (route == null || route.methodParameters === undefined) {
            throw new Error("No route loaded");
        }

        console.log(`   You'll get ${route.quote.toFixed()} ${tokenOut.token.symbol}`);
        console.log(`   Gas Adjusted Quote: ${route.quoteGasAdjusted.toFixed()}`);
        console.log(`   Gas Used Quote Token: ${route.estimatedGasUsedQuoteToken.toFixed()}`);
        console.log(`   Gas Used USD: ${route.estimatedGasUsedUSD.toFixed()}`);
        console.log(`   Gas Used: ${route.estimatedGasUsed.toString()}`);
        console.log(`   Gas Price Wei: ${route.gasPriceWei}`);
        console.log('');

        balanceTokenIn = ethers.utils.formatUnits(tokenIn.balance, tokenIn.token.decimals);
        balanceTokenOut = ethers.utils.formatUnits(tokenOut.balance, tokenOut.token.decimals);
        tokenInSymbol = tokenIn.token.symbol;
        tokenOutSymbol = tokenOut.token.symbol;

        res.status(200).json({
            estimatedOutput: route.quote.toFixed(), // Use the correct decimals for formatting
            gasAdjustedQuote: route.quoteGasAdjusted.toFixed(),
            gasUsedQuoteToken: route.estimatedGasUsedQuoteToken.toFixed(),
            gasUsedUSD: route.estimatedGasUsedUSD.toFixed(),
            gasUsed: route.estimatedGasUsed.toString(),
            gasPriceWei: route.gasPriceWei,
            balanceTokenIn: balanceTokenIn,
            balanceTokenOut: balanceTokenOut,
            tokenIn: tokenInSymbol,
            tokenOut: tokenOutSymbol
        });


    } catch (error) {
        console.error(`Error in quote retrieval: ${error.message}`);
        // Prepare error details
        const tokenInDetails = tokenIn ? `In token ${tokenIn.token.symbol}, balance: ${ethers.utils.formatUnits(tokenIn.balance, tokenIn.token.decimals)}` : "In token details not available";
        const tokenOutDetails = tokenOut ? `Out token ${tokenOut.token.symbol}, balance: ${ethers.utils.formatUnits(tokenOut.balance, tokenOut.token.decimals)}` : "Out token details not available";
        balanceTokenIn = ethers.utils.formatUnits(tokenIn.balance, tokenIn.token.decimals);
        balanceTokenOut = ethers.utils.formatUnits(tokenOut.balance, tokenOut.token.decimals);
        tokenInSymbol = tokenIn.token.symbol;
        tokenOutSymbol = tokenOut.token.symbol;

        res.status(500).json({
            error: `Error during quote: Consider that the user has ${balanceTokenIn} ${tokenInSymbol} and ${balanceTokenOut} ${tokenOutSymbol}`
        });
    }
});



app.post('/multiQuote', async (req, res) => {
    try {
        const swaps = req.body.swaps;
        const results = [];

        for (const swap of swaps) {
            let tokenIn, tokenOut, balanceTokenIn, balanceTokenOut, tokenInSymbol, tokenOutSymbol;

            const { chainId, walletAddress, tokenInAddress, tokenOutAddress, amountIn } = swap;
            console.log("Starting quote retrieval for a swap...");

            const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);
            tokenIn = await getTokenDetailsAndBalance(contractIn, chainId, walletAddress);

            const contractOut = new ethers.Contract(tokenOutAddress, ERC20_abi, signer);
            tokenOut = await getTokenDetailsAndBalance(contractOut, chainId, walletAddress);

            console.log("Loading up quote for a swap...");
            const amountInBn = ethers.utils.parseUnits(amountIn.toString(), tokenIn.token.decimals);

            // Uniswap quoter contract for getting a quote
            const quoterContract = new ethers.Contract(UNISWAP_QUOTER_ADDRESS, QuoterABI.abi, provider);
            const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
                tokenIn.token.address,
                tokenOutAddress,
                3000, // Assuming a fixed fee tier of 0.3%; adapt as needed
                amountInBn,
                0 // No price limit
            );

            console.log(`   You'll get approximately ${ethers.utils.formatUnits(quotedAmountOut, tokenOut.token.decimals)} tokens for ${amountIn} ${tokenIn.token.symbol}`);

            balanceTokenIn = ethers.utils.formatUnits(tokenIn.balance, tokenIn.token.decimals);
            balanceTokenOut = ethers.utils.formatUnits(tokenOut.balance, tokenOut.token.decimals);
            tokenInSymbol = tokenIn.token.symbol;
            tokenOutSymbol = tokenOut.token.symbol;

            results.push({
                balanceTokenIn,
                balanceTokenOut,
                tokenInSymbol,
                tokenOutSymbol,
                estimatedQuote: ethers.utils.formatUnits(quotedAmountOut, tokenOut.token.decimals)
            });
        }

        res.json({ results });
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while retrieving the quotes');
    }
});


    





/**
 * API endpoint to execute a token swap
 * @route POST /swap
 * @param {Object} req.body - Swap parameters
 * @returns {Object} Swap result
 */
app.post('/swap', performSwap);


/**
 * API endpoint to upload a file to Irys
 * @route POST /upload
 * @param {Object} req.file - File to upload
 * @returns {Object} Irys ID and URL
 */
app.post('/upload', upload.single('encryptedFile'), async (req, res) => {
    try {
        const file = req.file; // The uploaded file


        const irys = new Irys({
            url: process.env.IRYS_URL,
            token: process.env.IRYS_TOKEN,
            key: process.env.PRIVATE_KEY,
            config: { providerUrl: process.env.IRYS_PROVIDER_URL }
        });


        // Assuming you want to save the file to disk
        const filePath = `data/${file.originalname}`;
        await fs.writeFile(filePath, file.buffer);


        const tags = [{ name: "conversation-id", value: "conversation-id" }];

        // Upload the saved ZIP file
        const receipt = await irys.uploadFile(filePath, { tags });

        

        console.log(`Data uploaded ==> https://gateway.irys.xyz/graphgl/${receipt.id}`);
        // Send the AI model's response as part of your API response
        res.json({ success: true, receipt: `https://gateway.irys.xyz/graphql/${receipt.id}` });

    } catch (error) {
        console.error("Error uploading data ", error);
        res.status(500).json({ success: false, error: error.message });
    }
});



app.listen(PORT, () => {
    console.log(`Irys service running on port ${PORT}`);
    // startCronJob();  // Start the cron job
    // startPriceCronJob();  // Start the cron job for fetching prices
  
});

