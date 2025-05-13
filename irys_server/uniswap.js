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

const { abi: V3SwapRouterABI } = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/ISwapRouter.sol/ISwapRouter.json');
const { abi: PeripheryPaymentsABI } = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/IPeripheryPayments.sol/IPeripheryPayments.json');
const { abi: MulticallABI } = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/IMulticall.sol/IMulticall.json');

const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
const UNISWAP_QUOTER_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
const TOKEN_CONTRACT_ADDRESS = '0x68a8bbfcecc2BC751b99a107E03a73eAc2A31d58';

const parentAccount = privateKeyToAccount(process.env.PRIVATE_KEY);
const API_URL = process.env.API_URL;
const parentAddress = parentAccount.address;

const provider = new ethers.providers.JsonRpcProvider(API_URL, polygon.id);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

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

// Get token details and balance for a given contract
const getTokenDetailsAndBalance = async (contract, chainId, walletAddress) => {
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
};

// Execute token approval for swap
const executeApproval = async (tokenboundClient, walletAddress, tokenInAddress, amountIn, decimals) => {
    const toV3Route = getAddress(V3_SWAP_ROUTER_ADDRESS);
    const approveAmount = ethers.utils.parseUnits(amountIn, decimals);
    const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);
    const dataApp = contractIn.interface.encodeFunctionData("approve", [toV3Route, approveAmount]);

    const tokenApprove = {
        account: walletAddress,
        to: tokenInAddress,
        value: ethers.constants.Zero,
        data: dataApp
    };

    const originalTx = await tokenboundClient.execute(tokenApprove);
    console.log('Approval transaction:', originalTx);

    if (originalTx) {
        const increasedGasPrice = ethers.utils.parseUnits('100', 'gwei');
        const newTransaction = {
            nonce: originalTx.nonce,
            gasLimit: originalTx.gasLimit,
            gasPrice: increasedGasPrice,
            to: originalTx.to,
            value: originalTx.value,
            data: originalTx.data,
            chainId: polygon.id
        };

        const sentTx = await signer.sendTransaction(newTransaction);
        console.log('New approval transaction:', sentTx.hash);

        const receipt = await sentTx.wait();
        if (receipt.status === 0) {
            throw new Error("Approval failed");
        }
        console.log("Approval successful");
    }
};

// Execute the actual swap transaction
const executeSwap = async (tokenboundClient, walletAddress, route) => {
    const toV3Router = getAddress(V3_SWAP_ROUTER_ADDRESS);
    const tokenBoundTx = {
        account: walletAddress,
        to: toV3Router,
        value: route.methodParameters.value,
        data: route.methodParameters.calldata
    };

    const swapTx = await tokenboundClient.execute(tokenBoundTx);
    console.log('Swap transaction:', swapTx);

    if (swapTx) {
        const increasedGasPrice = ethers.utils.parseUnits('100', 'gwei');
        const newTransaction = {
            nonce: swapTx.nonce,
            gasLimit: swapTx.gasLimit,
            gasPrice: increasedGasPrice,
            to: swapTx.to,
            value: swapTx.value,
            data: swapTx.data,
            chainId: polygon.id
        };

        const sentTx = await signer.sendTransaction(newTransaction);
        console.log('New swap transaction:', sentTx.hash);

        const receipt = await sentTx.wait();
        if (receipt.status === 0) {
            throw new Error("Swap transaction failed");
        }
        return receipt;
    }
};

// Main function to perform token swap
const performSwap = async (req, res) => {
    try {
        const { chainId, walletAddress, tokenInAddress, tokenOutAddress, amountIn } = req.body;

        const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, signer);
        const contractOut = new ethers.Contract(tokenOutAddress, ERC20_abi, signer);
        const tokenboundClient = new TokenboundClient({ walletClient, chainId: polygon.id });

        const isValidSigner = await tokenboundClient.isValidSigner({ account: walletAddress });
        console.log('Valid signer:', isValidSigner);

        const [tokenIn, tokenOut] = await Promise.all([
            getTokenDetailsAndBalance(contractIn, chainId, walletAddress),
            getTokenDetailsAndBalance(contractOut, chainId, walletAddress)
        ]);

        console.log(`Wallet ${walletAddress} balances:`);
        console.log(`Input: ${tokenIn.token.symbol} (${tokenIn.token.name}): ${ethers.utils.formatUnits(tokenIn.balance, tokenIn.token.decimals)}`);
        console.log(`Output: ${tokenOut.token.symbol} (${tokenOut.token.name}): ${ethers.utils.formatUnits(tokenOut.balance, tokenOut.token.decimals)}`);

        const amountInBn = ethers.utils.parseUnits(amountIn, tokenIn.token.decimals);
        const quoterContract = new ethers.Contract(UNISWAP_QUOTER_ADDRESS, QuoterABI.abi, provider);
        const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
            tokenIn.token.address,
            tokenOut.token.address,
            3000,
            amountInBn,
            0
        );

        console.log(`Quote: ${ethers.utils.formatUnits(quotedAmountOut, tokenOut.token.decimals)} ${tokenOut.token.symbol} for ${amountIn} ${tokenIn.token.symbol}`);

        const inAmount = CurrencyAmount.fromRawAmount(tokenIn.token, amountInBn.toString());
        const router = new AlphaRouter({ chainId: tokenIn.token.chainId, provider });
        const route = await router.route(
            inAmount,
            tokenOut.token,
            TradeType.EXACT_INPUT,
            {
                recipient: walletAddress,
                slippageTolerance: new Percent(5, 100),
                deadline: Math.floor(Date.now() / 1000 + 1800)
            },
            { maxSwapsPerPath: 1 }
        );

        if (!route?.methodParameters) {
            throw new Error("No route found");
        }

        console.log(`Route found: ${route.quote.toFixed()} ${tokenOut.token.symbol}`);
        console.log(`Gas Adjusted Quote: ${route.quoteGasAdjusted.toFixed()}`);
        console.log(`Gas Used: ${route.estimatedGasUsed.toString()}`);

        await executeApproval(tokenboundClient, walletAddress, tokenInAddress, amountIn, tokenIn.token.decimals);
        await executeSwap(tokenboundClient, walletAddress, route);

        const [newBalanceIn, newBalanceOut] = await Promise.all([
            contractIn.balanceOf(walletAddress),
            contractOut.balanceOf(walletAddress)
        ]);

        console.log('Swap completed successfully!');
        console.log('Updated balances:');
        console.log(`${tokenIn.token.symbol}: ${ethers.utils.formatUnits(newBalanceIn, tokenIn.token.decimals)}`);
        console.log(`${tokenOut.token.symbol}: ${ethers.utils.formatUnits(newBalanceOut, tokenOut.token.decimals)}`);

        res.status(200).json({
            message: 'Swap completed successfully!',
            newBalances: {
                [tokenIn.token.symbol]: ethers.utils.formatUnits(newBalanceIn, tokenIn.token.decimals),
                [tokenOut.token.symbol]: ethers.utils.formatUnits(newBalanceOut, tokenOut.token.decimals)
            }
        });
    } catch (error) {
        console.error('Swap error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { performSwap };