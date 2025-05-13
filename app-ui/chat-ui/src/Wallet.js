import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import axios from 'axios';
import myTokens from './myTokens.json';
import { useAccount } from 'wagmi';
import { AppBar, Tab, Box, Typography, TextField, Button, MenuItem, IconButton, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Snackbar } from '@mui/material';
import { TabContext, TabList, TabPanel } from '@mui/lab';
import { ContentCopy } from '@mui/icons-material';
import Lottie from 'react-lottie';
import animationData from './loading-animation.json'; // Ensure this file exists
import './Wallet.css';

import { createWalletClient, custom, http } from 'viem';
import { polygon } from 'viem/chains';
import { TokenboundClient } from '@tokenbound/sdk';

const Wallet = ({ onTokenBoundAddressChange, onAccountNameChange, refresh }) => {
  const { address } = useAccount();
  const [balances, setBalances] = useState({});
  const [isOpen, setIsOpen] = useState(false);
  const [tokenBoundAddress, setTokenBoundAddress] = useState('');
  const [accounts, setAccounts] = useState('');
  const [value, setValue] = useState('1');
  const [tokenboundAddresses, setTokenboundAddresses] = useState([]);
  const [tokenboundNames, setTokenboundNames] = useState([]);
  const [sendDetails, setSendDetails] = useState({
    amount: '',
    token: 'WMATIC',
    recipient: ''
  });
  const [isValidSigner, setIsValidSigner] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountDescription, setNewAccountDescription] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const tokenMap = myTokens.reduce((acc, token) => {
    acc[token.symbol] = token;
    return acc;
  }, {});

  const fetchAccounts = useCallback(async (address) => {
    try {
      setLoading(true);
      const response = await axios.post('http://localhost:3002/fetchAccounts', { walletAddress: address });
      const accounts = response.data.accounts || [];
      const addresses = accounts.map(account => account.accountAddress);
      const names = accounts.map(account => account.name || shortenAddress(account.accountAddress));
      setAccounts(accounts);
      setTokenboundAddresses(addresses);
      setTokenboundNames(names);
      setLoading(false);
      if (addresses.length === 0) {
        setBalances({});
        setSelectedAccount('');
      }
    } catch (error) {
      console.error('Error fetching token-bound addresses:', error);
      setLoading(false);
      return '';
    }
  }, []);

  useEffect(() => {
    setBalances({});
    setSelectedAccount('');
  }, [address]);

  const fetchBalances = useCallback(async (tokenBoundAddress) => {
    if (!address || !tokenBoundAddress) {
      console.log('No address or tokenBoundAddress provided');
      return;
    }

    console.log('Fetching balances for token-bound address:', tokenBoundAddress);
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const tokenBalances = {};

    for (const token of myTokens) {
      if (!token.address) {
        console.error('Invalid token address for token:', token);
        continue;
      }

      try {
        const tokenContract = new ethers.Contract(token.address, [
          "function balanceOf(address owner) view returns (uint256)"
        ], provider);

        const balance = await tokenContract.balanceOf(tokenBoundAddress);
        tokenBalances[token.symbol] = parseFloat(ethers.utils.formatUnits(balance, token.decimals)).toFixed(4);
      } catch (error) {
        console.error('Failed to fetch balance for token:', token.symbol, 'Error:', error);
      }
    }

    console.log('Fetched balances:', tokenBalances);
    setBalances(tokenBalances);
  }, [address]);

  const handleWalletClick = async () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchAccounts(address);
      setTokenBoundAddress(selectedAccount);
      onTokenBoundAddressChange(selectedAccount);
      onAccountNameChange(newAccountName);
      await fetchBalances(selectedAccount);
    }
  };

  const handleTabChange = async (event, newValue) => {
    setValue(newValue);
    if (newValue === '2' && selectedAccount) {
      fetchBalances(selectedAccount);
    }
    if (newValue === '3' && selectedAccount) {
      const walletClient = createWalletClient({
        chainId: polygon.id,
        account: address,
        transport: window.ethereum ? custom(window.ethereum) : http(),
      });

      const tokenboundClient = new TokenboundClient({ walletClient, chainId: polygon.id });

      const isValid = await tokenboundClient.isValidSigner({
        account: selectedAccount,
      });
      setIsValidSigner(isValid);
      console.log('isValidSigner?', isValid);
    }
  };

  const handleSendDetailsChange = (e) => {
    setSendDetails({
      ...sendDetails,
      [e.target.name]: e.target.value
    });
  };

  const handleSend = async () => {
    try {
      const { token, amount, recipient } = sendDetails;
      const tokenInfo = tokenMap[token];

      if (!tokenInfo) {
        console.error('Token information not found');
        return;
      }

      const walletClient = createWalletClient({
        chainId: polygon.id,
        account: address,
        transport: window.ethereum ? custom(window.ethereum) : http(),
      });

      const tokenboundClient = new TokenboundClient({ walletClient, chainId: polygon.id });

      console.log('Sending:', sendDetails);

      const transferERC20 = await tokenboundClient.transferERC20({
        account: selectedAccount,
        amount: amount,
        recipientAddress: recipient,
        erc20tokenAddress: tokenInfo.address,
        erc20tokenDecimals: tokenInfo.decimals,
      });

      console.log('Transfer result:', transferERC20);
    } catch (error) {
      console.error('Error sending tokens:', error);
    }
  };

  const handleCallOwnership = async () => {
    try {
      setLoading(true);
      const response = await axios.post('http://localhost:3002/getOwnership', { tokenboundAddress: selectedAccount });
      console.log('Ownership details:', response.data);
      await new Promise(resolve => setTimeout(resolve, 9990));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching ownership details:', error);
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setOpenDialog(true);
  };

  const handleDialogClose = async (create) => {
    setOpenDialog(false);
    if (create) {
      try {
        setLoading(true);
        const response = await axios.post('http://localhost:3002/createAccount', { address, name: newAccountName, description: newAccountDescription });
        console.log('Create account response:', response.data);
        // Optionally refresh the account list after creation
        await fetchAccounts(address);
        setLoading(false);
      } catch (error) {
        console.error('Error creating account:', error);
        setLoading(false);
      }
    }
    setNewAccountName('');
    setNewAccountDescription('');
  };

  const shortenAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleAccountClick = (address) => {
    setSelectedAccount(address);
    onTokenBoundAddressChange(address);
    const accountName = accounts.find(account => account.accountAddress === address)?.name || 'Default Name';
    setNewAccountName(accountName);
    onAccountNameChange(accountName);
    fetchBalances(address);
  };

  const handleCopyAddress = (address, event) => {
    event.stopPropagation(); // Prevent the click event from propagating to the account click handler
    navigator.clipboard.writeText(address);
    setSnackbarOpen(true);
  };

  useEffect(() => {
    if (selectedAccount) {
      const setupClient = async () => {
        const walletClient = createWalletClient({
          chainId: polygon.id,
          account: address,
          transport: window.ethereum ? custom(window.ethereum) : http(),
        });

        const tokenboundClient = new TokenboundClient({ walletClient, chainId: polygon.id });

        const isValid = await tokenboundClient.isValidSigner({
          account: selectedAccount,
        });
        setIsValidSigner(isValid);
        console.log('isValidSigner?', isValid);
      };

      setupClient();
    }
  }, [address, selectedAccount, loading]);

  useEffect(() => {
    if (isOpen && tokenBoundAddress) {
      console.log("Wallet: ", refresh)
      fetchBalances(tokenBoundAddress);
    }
  }, [isOpen, tokenBoundAddress, fetchBalances, refresh]);


  useEffect(() => {
    const fetchData = async () => {
      fetchAccounts(address);
      setTokenBoundAddress(selectedAccount);
      onTokenBoundAddressChange(selectedAccount);
      await fetchBalances(selectedAccount);
    };
    fetchData();
  }, [address, fetchAccounts, fetchBalances, onTokenBoundAddressChange, selectedAccount]);

  const lottieOptions = {
    loop: true,
    autoplay: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid slice'
    }
  };

  return (
    <div className="wallet">
      <button className="wallet-button" onClick={handleWalletClick}>
        Wallet
      </button>
      {isOpen && (
        <div className="wallet-dropdown">
          <Box sx={{ width: '100%', typography: 'body1' }}>
            <TabContext value={value}>
              <AppBar position="static">
                <TabList onChange={handleTabChange} aria-label="wallet tabs" className="tabs">
                  <Tab label="Accounts" value="1" sx={{ color: value === '1' ? 'white' : 'inherit' }} />
                  <Tab label="Balances" value="2" sx={{ color: value === '2' ? 'white' : 'inherit' }} />
                  <Tab label="Send" value="3" sx={{ color: value === '3' ? 'white' : 'inherit' }} />
                </TabList>
              </AppBar>
              <TabPanel value="1">
                <Typography variant="h6">Tokenbound Accounts</Typography>
                {loading ? (
                  <Lottie options={lottieOptions} height={100} width={100} />
                ) : (
                  <ul>
                    {tokenboundAddresses.map((address, index) => (
                      <li
                        key={index}
                        style={{
                          backgroundColor: selectedAccount === address ? 'lightblue' : 'transparent',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleAccountClick(address)}
                      >
                        {tokenboundNames[index] || shortenAddress(address)}
                        <IconButton onClick={(event) => handleCopyAddress(address, event)} size="small">
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="contained" color="primary" onClick={handleCreateAccount}>
                  Create Account
                </Button>
              </TabPanel>
              <TabPanel value="2">
                <Typography variant="h6">Token Balances</Typography>
                {selectedAccount ? (
                  <ul>
                    {Object.entries(balances).map(([symbol, balance]) => (
                      <li key={symbol}>
                        {symbol}: {balance}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Typography variant="body2">No account selected</Typography>
                )}
              </TabPanel>
              <TabPanel value="3">
                <Typography variant="h6">Send Tokens</Typography>
                {selectedAccount ? (
                  <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      label="Amount"
                      variant="outlined"
                      name="amount"
                      value={sendDetails.amount}
                      onChange={handleSendDetailsChange}
                    />
                    <TextField
                      select
                      label="Token"
                      variant="outlined"
                      name="token"
                      value={sendDetails.token}
                      onChange={handleSendDetailsChange}
                    >
                      {Object.keys(balances).map((token) => (
                        <MenuItem key={token} value={token}>
                          {token}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="Recipient Wallet Address"
                      variant="outlined"
                      name="recipient"
                      value={sendDetails.recipient}
                      onChange={handleSendDetailsChange}
                    />
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleSend}
                      disabled={!isValidSigner}
                      style={{ opacity: isValidSigner ? 1 : 0.5 }}
                    >
                      Send
                    </Button>
                  </Box>
                ) : (
                  <Typography variant="body2">No account selected</Typography>
                )}
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleCallOwnership}
                  disabled={isValidSigner || !selectedAccount}
                  style={{ opacity: isValidSigner || !selectedAccount ? 0.5 : 1, marginTop: '16px' }}
                  fullWidth
                >
                  {loading ? <Lottie options={lottieOptions} height={24} width={24} /> : 'Get Ownership'}
                </Button>
              </TabPanel>
            </TabContext>
          </Box>
        </div>
      )}

      {/* Dialog for creating a new account */}
      <Dialog open={openDialog} onClose={() => handleDialogClose(false)}>
        <DialogTitle>Create New Account</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Please enter the name and a brief description for the new account.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Account Name"
            type="text"
            fullWidth
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Description"
            type="text"
            fullWidth
            value={newAccountDescription}
            onChange={(e) => setNewAccountDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => handleDialogClose(false)} color="primary">
            Cancel
          </Button>
          <Button onClick={() => handleDialogClose(true)} color="primary">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for copy feedback */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={1000}
        onClose={() => setSnackbarOpen(false)}
        message="Address copied to clipboard"
      />
    </div>
  );
};

export default Wallet;
