import { ethers } from 'ethers';
import { Token, CurrencyAmount, Percent, TradeType } from '@uniswap/sdk-core';
import { AlphaRouter } from '@uniswap/smart-order-router';
import ERC20_abi from './ERC20_abi.json';
import QuoterABI from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';

const UNISWAP_QUOTER_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
// Tether USD on Polygon
const USDT_ADDRESS = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'; 

/**
 * Get ethers provider using MetaMask if available or fallback to RPC
 * @returns {ethers.providers.Provider} Web3 provider
 */
const getProvider = () => {
  if (window.ethereum) {
    return new ethers.providers.Web3Provider(window.ethereum);
  }
  // Fallback to a read-only provider - cannot execute transactions
  return new ethers.providers.JsonRpcProvider(process.env.REACT_APP_RPC_URL);
};

/**
 * Fetch token details and user balance for a given token
 * @param {ethers.Contract} contract - The ERC20 token contract
 * @param {number} chainId - Chain ID of the network
 * @param {string} walletAddress - User's wallet address
 * @returns {Object} Token details and user balance
 */
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

/**
 * Get price quote for swapping between two tokens using Uniswap
 * @param {number} chainId - Chain ID of the network
 * @param {string} walletAddress - User's wallet address
 * @param {string} tokenInAddress - Address of token to swap from
 * @param {string} tokenOutAddress - Address of token to swap to
 * @param {number} amountIn - Amount of input token to swap
 * @returns {Object} Swap details including estimated output, gas costs, etc.
 */
export async function quote(chainId, walletAddress, tokenInAddress, tokenOutAddress, amountIn) {
    const provider = getProvider();
    
    // Initialize token contracts and get details
    const contractIn = new ethers.Contract(tokenInAddress, ERC20_abi, provider);
    const tokenIn = await getTokenDetailsAndBalance(contractIn, chainId, walletAddress);

    const contractOut = new ethers.Contract(tokenOutAddress, ERC20_abi, provider);
    const tokenOut = await getTokenDetailsAndBalance(contractOut, chainId, walletAddress);

    // Convert input amount to token units
    const amountInBn = ethers.utils.parseUnits(amountIn.toString(), tokenIn.token.decimals);

    // Get price quote from Uniswap quoter contract
    const quoterContract = new ethers.Contract(UNISWAP_QUOTER_ADDRESS, QuoterABI.abi, provider);
    const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
        tokenIn.token.address,
        tokenOutAddress,
        3000, // 0.3% fee tier
        amountInBn,
        0 // Sqrtpricex96 - 0 for best price through all available pools
    );

    // Calculate optimized swap route with AlphaRouter
    const inAmount = CurrencyAmount.fromRawAmount(tokenIn.token, amountInBn.toString());
    const router = new AlphaRouter({ chainId: tokenIn.token.chainId, provider: provider });

    const route = await router.route(
        inAmount,
        tokenOut.token,
        TradeType.EXACT_INPUT,
        {
            recipient: walletAddress,
            slippageTolerance: new Percent(5, 100), // 5% slippage tolerance
            deadline: Math.floor(Date.now() / 1000 + 1800) // 30 minutes
        },
        {
            maxSwapsPerPath: 1 // Limit to direct swaps for simplicity
        }
    );

    if (!route || !route.methodParameters) {
        throw new Error("No route loaded");
    }

    // Return detailed swap information
    return {
        estimatedOutput: route.quote.toFixed(),
        gasAdjustedQuote: route.quoteGasAdjusted.toFixed(),
        gasUsedQuoteToken: route.estimatedGasUsedQuoteToken.toFixed(),
        gasUsedUSD: route.estimatedGasUsedUSD.toFixed(),
        gasUsed: route.estimatedGasUsed.toString(),
        gasPriceWei: route.gasPriceWei,
        tokenIn: tokenIn.token.symbol,
        tokenOut: tokenOut.token.symbol
    };
}
