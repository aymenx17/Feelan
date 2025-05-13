import './App.css';
import React, { useState } from 'react';

import ChatWindow from './ChatWindow';
import { publicProvider } from 'wagmi/providers/public';
import { createConfig, configureChains, mainnet, WagmiConfig } from 'wagmi';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { MetaMaskConnector } from 'wagmi/connectors/metaMask';
import Wallet from './Wallet';




const { chains, publicClient, webSocketPublicClient } = configureChains(
  [mainnet],
  [publicProvider()]
);

const config = createConfig({
  connectors: [
    new InjectedConnector({ chains }),
    new MetaMaskConnector({
      chains,
      options: {
        shimDisconnect: true,
        UNSTABLE_shimOnConnectSelectAccount: true,
      },
    }),
  ],
  publicClient,
  webSocketPublicClient,
});

const Web3Provider = ({ children }) => {
  return <WagmiConfig config={config}>{children}</WagmiConfig>;
};


function App() {

  const [tokenBoundAddress, setTokenBoundAddress] = useState('');
  const [accountName, setAccountName] = useState('');
  const [refresh, setRefresh] = useState(false);


  // Handler to update the token-bound address state when it changes in the Wallet component.
  const handleTokenBoundAddressChange = (address) => {
    setTokenBoundAddress(address);
  };
  const handleAccountNameChange = (name) => {
    setAccountName(name);
  };
  const handleRefresh = (value) => {
    setRefresh(value);
  };


  return (
    <div className="App">
      {/* Chat window is the main component of the app */}
      <Web3Provider>
      <Wallet refresh={refresh} onTokenBoundAddressChange={handleTokenBoundAddressChange}
              onAccountNameChange={handleAccountNameChange  }
       />

      <ChatWindow accountAddress={tokenBoundAddress} accountName={accountName} onRefresh={handleRefresh} />
      </Web3Provider>
      

      {/* Optional: Any additional content or components */}
      {/* You can remove or modify this part according to your app's needs */}
      <footer className="App-footer">
      </footer>
    </div>
  );
}

export default App;
