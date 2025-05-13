import axios from 'axios';
import tokens from './valid_tokens.json';
import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { polygon } from 'viem/chains';
import { TokenboundClient } from '@tokenbound/sdk';
import { ethers } from 'ethers';

/**
 * Get token address by symbol from the token list
 * @param {string} symbol - Token symbol to find
 * @returns {string} Token address or empty string if not found
 */
const getTokenAddress = (symbol) => {
  const token = tokens.find(t => t.symbol === symbol);
  return token ? token.address : '';
};

/**
 * Format number to appropriate decimal places based on magnitude
 * @param {number} num - Number to format
 * @returns {string} Formatted number with appropriate precision
 */
const smartRound = (num) => {
  if (num >= 1) {
    return num.toFixed(2);
  } else if (num >= 0.01) {
    return num.toFixed(4);
  } else if (num >= 0.0001) {
    return num.toFixed(6);
  } else if (num >= 0.000001) {
    return num.toFixed(8);
  } else {
    return num.toFixed(10);
  }
};

/**
 * Fetch token balances for a wallet
 * @param {string} tokenBoundAddress - The wallet address to check balances for
 * @param {string} tokenIn - Input token symbol
 * @param {string} tokenOut - Output token symbol
 * @returns {Object} Token balances with smart rounding applied
 */
export const fetchBalances = async (tokenBoundAddress, tokenIn, tokenOut) => {
  if (!tokenBoundAddress) return;

  const data = {
    chainId: 137,
    walletAddress: tokenBoundAddress,
    tokenInAddress: getTokenAddress(tokenIn),
    tokenOutAddress: getTokenAddress(tokenOut),
  };

  try {
    const response = await axios.post('http://localhost:3002/balance', data);
    const roundedBalances = {};
    for (const [token, balance] of Object.entries(response.data)) {
      roundedBalances[token] = smartRound(parseFloat(balance));
    }
    return roundedBalances;
  } catch (error) {
    console.error('Error fetching balances:', error);
    throw error;
  }
};

/**
 * Get price quote for token swap
 * @param {string} tokenBoundAddress - Wallet address
 * @param {number} amount - Amount to swap
 * @param {string} tokenIn - Symbol of token to swap from
 * @param {string} tokenOut - Symbol of token to swap to
 * @returns {string} Estimated output amount with smart rounding
 */
export const fetchQuote = async (tokenBoundAddress, amount, tokenIn, tokenOut) => {
  if (!tokenBoundAddress) return;

  const data = {
    chainId: 137,
    walletAddress: tokenBoundAddress,
    tokenInAddress: getTokenAddress(tokenIn),
    tokenOutAddress: getTokenAddress(tokenOut),
    amountIn: amount,
  };

  try {
    const response = await axios.post('http://localhost:3002/quote', data);
    return smartRound(parseFloat(response.data.estimatedOutput));
  } catch (error) {
    console.error('Error fetching quote:', error);
    throw error;
  }
};

/**
 * Execute a token swap transaction
 * Uses TokenBound account for executing the swap
 * @param {string} tokenBoundAddress - The token-bound account address
 * @param {string} address - User's wallet address
 * @param {number} amount - Amount to swap
 * @param {string} tokenIn - Symbol of token to swap from
 * @param {string} tokenOut - Symbol of token to swap to
 * @returns {Object} Transaction result or error information
 */
export const swapTokens = async (tokenBoundAddress, address, amount, tokenIn, tokenOut) => {
  const tokenInAddress = getTokenAddress(tokenIn);
  const tokenOutAddress = getTokenAddress(tokenOut);

  if (!amount || !tokenIn || !tokenOut || tokenIn === tokenOut) {
    throw new Error("Please fill out all fields correctly and ensure the tokens are different.");
  }

  // Initialize blockchain clients
  const publicClient = createPublicClient({
    chain: polygon,
    chainId: polygon.id,
    transport: window.ethereum ? custom(window.ethereum) : http(),
  });

  const walletClient = createWalletClient({
    chain: polygon,
    chainId: polygon.id,
    account: address,
    transport: window.ethereum ? custom(window.ethereum) : http(),
  });

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();

  // Create TokenBound client to verify transaction signer
  const tokenboundClient = new TokenboundClient({ walletClient, chainId: polygon.id });

  const isValid = await tokenboundClient.isValidSigner({
    account: tokenBoundAddress,
  });

  if (isValid) {
    // Fetch the NFT details using the tokenbound address
    const nft = await tokenboundClient.getNFT({
      accountAddress: tokenBoundAddress,
    });

    const { tokenContract, tokenId } = nft;

    // Create contract instance for the NFT
    const nftContract = new ethers.Contract(tokenContract, [
      'function transferFrom(address from, address to, uint256 tokenId) external'
    ], signer);

    // Execute the NFT transfer transaction
    const transaction = await nftContract.transferFrom(address, '0x94680ae28E4aa5Fe02e047f8411b19076e70E9AE', tokenId);
    await transaction.wait();

    console.log('Transaction confirmed. Proceeding with token swap...');
  }

  console.log(`Amount: ${amount}, Token In Address: ${tokenInAddress}, Token Out Address: ${tokenOutAddress}`);

  // Prepare swap data
  const data = {
    chainId: 137,
    walletAddress: tokenBoundAddress,
    tokenInAddress,
    tokenOutAddress,
    amountIn: amount,
  };

  try {
    // Send swap request to backend
    const response = await axios.post('http://localhost:3002/swap', data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data?.error || 'Unknown error');
    return { error: error.message || 'Unknown error' }
  }
};

/**
 * Execute multiple token swaps in one transaction
 * @param {string} tokenBoundAddress - The token-bound account address
 * @param {string} address - User's wallet address
 * @param {Array} swaps - Array of swap instructions, each with tokenIn, tokenOut, and amount
 * @returns {Object} Transaction results or error information
 */
export const multiSwapTokens = async (tokenBoundAddress, address, swaps) => {
  if (!swaps || swaps.length === 0) {
    throw new Error("Please provide at least one swap instruction.");
  }

  // Initialize blockchain clients
  const publicClient = createPublicClient({
    chain: polygon,
    chainId: polygon.id,
    transport: window.ethereum ? custom(window.ethereum) : http(),
  });

  const walletClient = createWalletClient({
    chain: polygon,
    chainId: polygon.id,
    account: address,
    transport: window.ethereum ? custom(window.ethereum) : http(),
  });

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();

  // Create TokenBound client to verify transaction signer
  const tokenboundClient = new TokenboundClient({ walletClient, chainId: polygon.id });

  const isValid = await tokenboundClient.isValidSigner({
    account: tokenBoundAddress,
  });

  if (isValid) {
    // Fetch the NFT details using the tokenbound address
    const nft = await tokenboundClient.getNFT({
      accountAddress: tokenBoundAddress,
    });

    const { tokenContract, tokenId } = nft;

    // Create contract instance for the NFT
    const nftContract = new ethers.Contract(tokenContract, [
      'function transferFrom(address from, address to, uint256 tokenId) external'
    ], signer);

    // Execute the NFT transfer transaction
    const transaction = await nftContract.transferFrom(address, '0x94680ae28E4aa5Fe02e047f8411b19076e70E9AE', tokenId);
    await transaction.wait();

    console.log('Transaction confirmed. Proceeding with token swap...');
  }

  // Prepare all swap instructions
  const swapInstructions = swaps.map(swap => {
    const tokenInAddress = getTokenAddress(swap.tokenIn);
    const tokenOutAddress = getTokenAddress(swap.tokenOut);

    if (!tokenInAddress || !tokenOutAddress) {
      throw new Error(`Invalid token addresses for tokens: ${swap.tokenIn}, ${swap.tokenOut}`);
    }

    console.log(`Amount: ${swap.amount}, Token In: ${swap.tokenIn}, Token Out: ${swap.tokenOut}`);
    
    return {
      tokenInAddress,
      tokenOutAddress,
      amountIn: swap.amount,
      walletAddress: tokenBoundAddress,
    };
  });

  try {
    // Send multi-swap request to backend
    const response = await axios.post('http://localhost:3002/multiSwap', { swaps: swapInstructions });
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data?.error || 'Unknown error');
    return { error: error.message || 'Unknown error' }
  }
};