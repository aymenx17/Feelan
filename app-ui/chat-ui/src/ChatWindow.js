import React, { useState, useEffect, useRef } from 'react';
import './ChatWindow.css';
import axios from 'axios'; // Ensure axios is installed: npm install axios
import { FaPencilAlt } from 'react-icons/fa'; // Make sure to install react-icons using npm or yarn
import ConversationButton from './ConversationButton'; // Adjust the path as necessary


import { Button } from 'antd';
import { useConnect, useAccount } from 'wagmi';
import { MetaMaskConnector } from 'wagmi/connectors/metaMask';

import Prism from 'prismjs';
import 'prismjs/themes/prism.css'; // Default theme
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-python'; // Import Python language component




import useLit from './lit_index';
import { fetchIrys, handleSave, fetchConversationSummary } from './IrysService';

import Web3 from 'web3';
import { ethers } from 'ethers';
import contractABI from './contractABI.json'; // Adjust path as necessary

import {shareNFT} from './MintNFT'; 
import {swapTokens, multiSwapTokens} from './TokenSwap';
import ProcessesUI from './processUI';
import { createProcess, queryProcess, runProcess, saveChat } from './ao_processes'; // Adjust the path as necessary
import AnsiToHtml from 'ansi-to-html';


import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { solarizedlight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'prismjs/components/prism-lua';

// You can also import other themes or extensions as needed


let initialConversations = null;

if (!initialConversations) {
  const savedConversations = sessionStorage.getItem('savedConversations');
  if (savedConversations) {
    initialConversations = JSON.parse(savedConversations);
  } 
}





const ChatWindow = ({accountAddress, accountName, onRefresh}) => {
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [savedConversations, setSavedConversations] = useState(initialConversations); // initialConversations
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null); // Create a ref for the messages end
  const [conversationSummaries, setConversationSummaries] = useState({});
  const [isAITyping, setIsAITyping] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [inputDisabled, setInputDisabled] = useState(true);
  const [refresh, setRefresh] = useState(false);

  const [selectedProcessId, setSelectedProcessId] = useState(null);




  const { encryptFile, decryptFile } = useLit(); // Use the encryptFile function
  const [decryptedText, setDecryptedText] = useState('');

  const [web3, setWeb3] = useState(null);
  const [contract, setContract] = useState(null);
  const contractMumbai = "0xA74E6Ec05A820F9B94354E6B7EAfE4A7B3879374";
  const contractMainnet = "0x0E58aB468daBE13FdAd6D3a273Cda50f6849ab1A";

  const { connect, connectors } = useConnect();
  const { address } = useAccount();
  const loginAttempted = useRef(false);

  


  const connectWallet = async () => {
    const metamask = connectors.find(
      (connector) => connector instanceof MetaMaskConnector
    );
    if (metamask) {
      await connect({ connector: metamask });   

    }
  };
  




  // Function to update the input field as the user types
  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  // Function to automatically scroll to the bottom of the chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };


  useEffect(() => {
    if (refresh) {
      onRefresh(refresh);
    }
  }, [refresh]);

  useEffect(() => {
    if (window.ethereum) {
      const web3Instance = new Web3(window.ethereum);
      setWeb3(web3Instance);
      const contractInstance = new web3Instance.eth.Contract(contractABI, contractMainnet);
      setContract(contractInstance);
    } else {
      console.log('MetaMask is not installed.');
    }
  }, []);


  useEffect(() => {
    Prism.highlightAll();
    scrollToBottom(); 
  }, [messages]); // Run Prism highlighter whenever messages update
  

    // Add a console log in the ChatWindow component to check the address state
  useEffect(() => {
    if (address && !loginAttempted.current){
      loginAttempted.current = true; // Prevent further login attempts

      // Call login function with the user's address
      loginUser(address).then(() => {
        console.log("Logged in successfully");
        setInputDisabled(false);
        // Proceed with any post-login logic here
      }).catch(error => {
        console.error("Login failed:", error);
      });
      }

  }, [address]);


  useEffect(() => {

    if (accessToken){

      

      fetchConversations(address).then(conversations => {
        // Handle the fetched conversations
        setSavedConversations(conversations);
        // Similar logic to handle summaries for fetched data
        const summaries = conversations.reduce((acc, conv) => {
        acc[conv.id] = conv.summary || "New Chat";
        return acc;
        }, {});
        setConversationSummaries(summaries);
      });

      // Reset input field and messages
      setInput(''); 
      setMessages([]); 

      console.log("Address:", address);
    }

  }, [accessToken]);

  // Save conversations to sessionStorage whenever the savedConversations state changes
  useEffect(() => {
    sessionStorage.setItem('savedConversations', JSON.stringify(savedConversations));
  }, [savedConversations]);

  useEffect(() => {
  // Generate a unique ID for the initial conversation when the component mounts
  const initialConversationId = `conv-${Date.now()}`;
  setCurrentConversationId(initialConversationId);


}, []);


  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Perform any cleanup or show warning
      // e.g., e.returnValue = "Are you sure you want to exit?";
      console.log("User is leaving the page");

      // Perform any operations you need here (like informing the server)
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const selectProcess = (processId) => {
    setSelectedProcessId(processId);
    // You can handle additional logic for selecting a process here
  };


  const loginUser = async (address) => {
    try {
      setAccessToken(null);
      const { signature, message } = await requestSignature(); // Destructure both signature and message
      const userId = address;
  
      // Prepare the payload with userId, signature, and message
      const payload = { userId: userId, signature: signature, message: message };
  
      // Call the login endpoint with Axios
      const response = await axios.post('http://127.0.0.1:5002/api/login', payload);
  
      // Assuming the token is returned in the response body
      const accessToken = response.data.access_token;
      setAccessToken(accessToken);
      loginAttempted.current = false; // Prevent further login attempts


      console.log("Login successful.");
  
      return accessToken;
  
    } catch (error) {
      console.error("Login failed:", error);
      // Handle login failure (e.g., by showing a message to the user)
    }
  };
  


  function requestSignature() {
    return new Promise((resolve, reject) => {
      if (!window.ethereum) {
        console.log('MetaMask is not installed!');
        reject(new Error('MetaMask is not installed!'));
        return;
      }
  
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
  
      signer.getAddress()
        .then((address) => {
          const message = `Sign this message to prove you own the address: ${address}`;
          // First, we get the signature
          return signer.signMessage(message).then(signature => ({ signature, message })); // Return an object with both
        })
        .then(({ signature, message }) => {
          console.log('Signed:', signature);
          resolve({ signature, message }); // Resolve the promise with the signature and message
        })
        .catch((error) => {
          console.error('Error signing message:', error);
          reject(error); // Reject the promise if an error occurs
        });
    });
  }
  
  
  // Define process-related functions
  const startProcess = () => {
    console.log('Starting process...');
    // Add your start process logic here
};

  const stopProcess = () => {
      console.log('Stopping process...');
      // Add your stop process logic here
  };

  const resetProcess = () => {
      console.log('Resetting process...');
      // Add your reset process logic here
  };


  const  fetchConversations = async (address) => {
    try {
      // Add necessary formData entries here
      const userId = address ? address : "addressUnknown";
      const payload = {userId: userId};
      // Include the Authorization header with the Bearer token
      const config = {
        headers: { Authorization: `Bearer ${accessToken}` }
      };
        
      const response = await axios.post('http://127.0.0.1:5002/api/retrieveAll', payload, config);
  
      if (!response.data.response) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
  
      return await response.data.response; // Assuming the response is in JSON format
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
      return []; // Return an empty array in case of an error
    }
  }

  

  const handleConversationSwitch = (conversationId = null) => {
    if (conversationId === currentConversationId) return;
  
    if (currentConversationId && messages.length > 0) {
        const updatedConversations = savedConversations.map(conv => {
            if (conv.id === currentConversationId) {
                if (conv.messages.length !== messages.length) {
                    console.log("Updated previous conversation");
                }
                return { ...conv, messages: messages };
            } else {
                return conv;
            }
        });
  
        const currentConversationExists = savedConversations.some(conv => conv.id === currentConversationId);
        if (!currentConversationExists) {
            if (!currentConversationId.startsWith('process-')) {
                fetchAndSetSummary(currentConversationId);
            }
            const newConversation = {
                id: currentConversationId,
                messages: messages,
                timestamp: new Date().toISOString(),
                summary: "summary",
                name: "New chat",
                isNFT: false,
                shelved: false,
                tokenURI: "tokenURI",
                type: "chat"
            };
            updatedConversations.push(newConversation);
            console.log("New conversation completely.");
        }
  
        setSavedConversations(updatedConversations);
    }
  
    if (conversationId) {
        loadConversation(conversationId);
    } else {
        setMessages([]);
        setCurrentConversationId(`conv-${Date.now()}`);
    }
  };
  

  

const startNewConversation = async () => {
  if (currentConversationId) {
    await handleConversationSwitch(null);
  }
  const newId = `conv-${Date.now()}`;
  setCurrentConversationId(newId);
  setMessages([]);
};

  


  // Function to handle loading a conversation
  const loadConversation = (conversationId) => {
    const conversationToLoad = savedConversations.find(conv => conv.id === conversationId);
    if (conversationToLoad) {
      setMessages(conversationToLoad.messages);
      setCurrentConversationId(conversationToLoad.id);
    }
  };



  const fetchAndSetSummary = async (convId) => {

    const userId = address ? address : "addressUnknown";
    // Include the Authorization header with the Bearer token
    const config = {
      headers: { Authorization: `Bearer ${accessToken}` }
    };
    
    const conversation = await fetchConversationSummary(convId, userId, config);


  
    try {

  
      // Extract the summary field
      const summary = conversation.summary || "No summary available";

      // Update the summary in the conversation summaries state
      setConversationSummaries(prevSummaries => ({
        ...prevSummaries,
        [convId]: summary
      }));
  
      setSavedConversations(prevConversations => {
        const updatedConversations = prevConversations.map(conv => {
          const maxLength = 42;
          let name = summary.length > maxLength ? summary.substr(0, maxLength - 3) + '...' : summary;
          if (conv.id === convId) {
            return { ...conv, summary: summary, name: name  }; // Updating the name property
          }
          return conv;
        });
  
        const updatedConversation = updatedConversations.find(conv => conv.id === convId);

        // Call backMetadataUpdate with the updated conversation
        if (updatedConversation) {
            backMetadataUpdate(updatedConversation);
        }

        return updatedConversations; // Return the updated state
    });


    } catch (error) {
      console.error('Error while fetching and decrypting:', error);
      alert('Error fetching files. See console for details.');
    }
  };
  
  
  const handleRefreshToggle = () => {
    setRefresh(prevRefresh => {
      const newRefresh = !prevRefresh;
      onRefresh(newRefresh); // Notify the parent component of the change
      return newRefresh;
    });
  };

  
  const createProcessConversation = async (processTags) => {

    // Assuming tags is an array of tags for the process
    const tags = processTags; // Replace with actual tags if needed
    const name = tags.find(item => item.name === 'Name').value;

    // Call the backend to create the process and get the process ID
    const process = await createProcess(address, tags, accessToken);

    // Generate a new process name using the process ID
    const newProcessName = `${name} ${process.processId.slice(0, 2)}...${process.processId.slice(-1)}`;


    const newConversationId = process.processId;
    const newConversation = {
      id: newConversationId,
      messages: [],
      timestamp: new Date().toISOString(),
      summary: newProcessName,
      name: newProcessName,
      isNFT: false,
      shelved: false,
      tokenURI: "tokenURI",
      type: "process"
    };
  
    setSavedConversations(conversations => {
      const updatedConversations = [...conversations, newConversation];
      return updatedConversations;
    });
  
    setConversationSummaries(prevSummaries => ({
      ...prevSummaries,
      [newConversationId]: newProcessName,
    }));


    return process
  };
  

  // Function to strip ANSI codes
  const stripAnsiCodes = (str) => {
    const ansiRegex = /\x1b\[[0-9;]*m/g;
    return str.replace(ansiRegex, '');
  };

  const sendMessage = async (conversationId = null, message = null) => {
    const messageToSend = message || input.trim();
    const convId = conversationId || currentConversationId;
    if (messageToSend) {
      setMessages(messages => [...messages, { role: 'Me', content: messageToSend }]);
      setInput('');
      setIsAITyping(true);
    
      try {
        const currentConversation = savedConversations.find(conv => conv.id === convId);
        const timestamp = currentConversation ? currentConversation.timestamp : new Date().toISOString();
        const userId = address ? address : "addressUnknown";
    
        const payload = {
          userId: userId,
          accountAddress: accountAddress,
          accountName: accountName,
          conversationId: convId,
          user_message: messageToSend,
          timestamp: timestamp,
          name: currentConversation?.name || "New chat",
          isNFT: currentConversation?.isNFT || false,
          shelved: currentConversation?.shelved || false,
          tokenURI: currentConversation?.tokenURI || "tokenURI",
          type: currentConversation?.type || "chat"
        };
    
        const config = {
          headers: { Authorization: `Bearer ${accessToken}` }
        };
        const response = await axios.post('http://127.0.0.1:5002/api/send-message', payload, config);
    
        if (response.data.response && response.data.response.includes('"intent":')) {
          try {
            const parsedResponse = JSON.parse(response.data.response);
  
            if (parsedResponse.intent === "create-process") {
              const processTags = parsedResponse.response.tags;
              const process = await createProcessConversation(processTags);
              displayProgressiveText("Created process");
            } else if (parsedResponse.intent === "query-process") {
              const query = parsedResponse.response.query;
              const query_result = await queryProcess(convId, query);
              const ansi_free = stripAnsiCodes(query_result);
              console.log(ansi_free);
              displayProgressiveText(query_result);
            
            
            } else if (parsedResponse.intent === "run-process") {
              const code = parsedResponse.response.code;
              const code_result = await runProcess(convId, code);
              console.log(code_result);
              displayProgressiveText("Code executed.");

            } else if (parsedResponse.intent === "swap_function") {
              const { tokenIn, tokenOut, amount } = parsedResponse.response;
              displayProgressiveText("Executing swap, getting back in a sec..");
              const swap_result = await swapTokens(accountAddress, address, String(amount), tokenIn, tokenOut);
              if (swap_result.error) {
                console.error('Error occurred during token swap:', swap_result.error);
                displayProgressiveText("Error during swap");
              } else {
                console.log('Token swap successful:', swap_result);
                displayProgressiveText("Swap executed");
                await new Promise(resolve => setTimeout(resolve, 3000));
                handleRefreshToggle();
                console.log('ChatWindow',refresh);
              } 
            } else if (parsedResponse.intent === "multiswap_function") {
              const swaps = parsedResponse.response;
              displayProgressiveText("Executing multiple swaps, getting back in a sec..");
              const swap_result = await multiSwapTokens(accountAddress, address, swaps);
              if (swap_result.error) {
                console.error('Error occurred during token swap:', swap_result.error);
                displayProgressiveText("Error during swap");
              } else {
                console.log('Token swap successful:', swap_result);
                displayProgressiveText("Swap executed");
                await new Promise(resolve => setTimeout(resolve, 3000));
                handleRefreshToggle();
                console.log('ChatWindow',refresh);
              } 
            } else if (parsedResponse.intent === "transfer_function") {
              const transferMessage = parsedResponse.response;
              displayProgressiveText(transferMessage);
              await new Promise(resolve => setTimeout(resolve, 3000));
              handleRefreshToggle();
            }
          } catch (error) {
            console.error('Error parsing AI response:', error);
          }
        } else {
          setIsAITyping(false);
          // payload.ai_message = response.data.response;
          // saveChat(payload, accessToken)  ;        
          displayProgressiveText(response.data.response);
        }
    
      } catch (error) {
        console.error('Error sending message:', error);
        setIsAITyping(false);
      }
    }
  };
  
  


  const backMetadataUpdate = async (conv) => {
    try {
      
      const { messages, ...payload } = conv;
      payload.userId = address ? address : "addressUnknown";
      // Include the Authorization header with the Bearer token
      const config = {
        headers: { Authorization: `Bearer ${accessToken}` }
      };
      const response = await axios.post('http://127.0.0.1:2/api/meta-update', payload, config);
      console.log("Metadata updated successfully", payload);
    } catch (error) {
      console.error("Failed to update conversation metadata", error);
    }
  };
  

  const handleRename = (conversationId) => {
    const newName = prompt('Rename here:');
    if (newName && newName.trim()) {
      setSavedConversations(conversations => {
        const updatedConversations = conversations.map(conversation => {
          if (conversation.id === conversationId) {
            return { ...conversation, name: newName.trim() }; // Updating the name property
          }
          return conversation;
        });
  
        const updatedConversation = updatedConversations.find(conv => conv.id === conversationId);

        // Call backMetadataUpdate with the updated conversation
        if (updatedConversation) {
            backMetadataUpdate(updatedConversation);
        }
  
        return updatedConversations; // Return the updated conversations array to update the state
      });
    } else {
      // Optionally handle the case where newName is empty or not provided
      console.log("No new name provided.");
    }
  };
  

  const shelveConversation = (conversationId) => {
    setSavedConversations(conversations => {
        const updatedConversations = conversations.map(conv => {
            if (conv.id === conversationId) {
                // Update the conversation by setting shelved to true
                return { ...conv, shelved: true };
            }
            return conv;
        });

        // Find the updated conversation right after updating
        // This ensures we are working with the updated state
        const updatedConversation = updatedConversations.find(conv => conv.id === conversationId);

        // Call backMetadataUpdate with the updated conversation
        if (updatedConversation) {
            backMetadataUpdate(updatedConversation);
        }

        return updatedConversations; // Return the updated state
    });
};


  
  

const handleMint = async (conversationId) => {

  const config = {
    headers: { Authorization: `Bearer ${accessToken}` }
  };
  // Assuming web3, contract, and address are correctly set up beforehand
  const tokenURI = await shareNFT(web3, contract, conversationId, config);

  //const tokenURI = "tokenURI test";
  console.log("TokenURI:", tokenURI);

  if (tokenURI) {
    // Update the conversation to reflect it's now an NFT, store the tokenURI,
    // and add a new message with the tokenURI
    setSavedConversations(conversations => {
        const updatedConversations = conversations.map(conv => {
            if (conv.id === conversationId) {
                // Return the updated conversation
                return { ...conv, isNFT: true, tokenURI: tokenURI};
            }
            return conv;
        });

        // Optionally, find and update backend metadata if needed
        // Note: This happens after the state update, consider any asynchronicity issues
        const updatedConversation = updatedConversations.find(conv => conv.id === conversationId);
        if (updatedConversation) {
            backMetadataUpdate(updatedConversation);
        }

        return updatedConversations;
    });
    
    

    handleConversationSwitch(conversationId);

    const message = `Minting NFT of this conversation with \nTokenURI: ${tokenURI}`;
    sendMessage(conversationId, message)


  }
};






const displayProgressiveText = (oText) => {
  const baseDelay = 7; // Minimum delay in ms
  const speedFactor = 10; // Adjust this to control how quickly speed increases with text length
  const progressiveLength = 40; // The number of characters to display progressively

  // Calculate the dynamic delay based on the length of the text
  let delay = Math.max(baseDelay, baseDelay + (speedFactor / Math.max(oText.length, 1)));

  const ansiToHtml = new AnsiToHtml();

  // Add an initial AI message entry with empty content
  setMessages(messages => [...messages, { role: 'AI', content: '' }]);
  let index = 0;

  // Fixing a sort of bug by adding a space character
  const text = " " + oText;
  console.log("text to be rendered:", text);

  const progressiveDisplay = setInterval(() => {
    if (index < progressiveLength && index <= text.length) {
      // Convert the text up to the current index to HTML
      const partialText = text.slice(0, index);
      const htmlText = ansiToHtml.toHtml(partialText);

      // Correctly update the last message (AI's message) in the array
      setMessages(currentMessages => {
        const updatedMessages = [...currentMessages];
        const lastMessageIndex = updatedMessages.length - 1;
        updatedMessages[lastMessageIndex] = {
          ...updatedMessages[lastMessageIndex],
          content: htmlText,
        };
        return updatedMessages;
      });
      index++;
    } else {
      // Display the remaining text all at once
      clearInterval(progressiveDisplay);
      const remainingText = text.slice(index);
      const finalText = ansiToHtml.toHtml(text.slice(0, index) + remainingText);
      
      setMessages(currentMessages => {
        const updatedMessages = [...currentMessages];
        const lastMessageIndex = updatedMessages.length - 1;
        updatedMessages[lastMessageIndex] = {
          ...updatedMessages[lastMessageIndex],
          content: finalText,
        };
        return updatedMessages;
      });
      
      setIsAITyping(false);
    }
  }, delay);
};



 
  
const renderMessage = (msg, index) => {
  const codeBlockRegex = /```(\w+)\s+([\s\S]*?)```/;
  const match = msg.content.match(codeBlockRegex);
  const isLastMessage = index === messages.length - 1;

  return (
    <React.Fragment key={index}>
      <div className={`message message-${msg.role}`}>
        <strong>{msg.role}</strong>
        {match ? (
          <pre>
            <code
              className={`language-${match[1]}`}
              dangerouslySetInnerHTML={{ __html: Prism.highlight(match[2], Prism.languages[match[1]], match[1]) }}
            />
          </pre>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: msg.content }} /> // Use dangerouslySetInnerHTML to render HTML content
        )}
      </div>
      {isLastMessage && isAITyping && (
        <div className="message message-AI typing-indicator">
          <strong>AI</strong> is typing...
        </div>
      )}
    </React.Fragment>
  );
};






return (
  <div className="chat-container">
    <div className="app-name"></div>
    <div className="conversations-sidebar">
      <div className="conversations-space"></div>
      {accessToken && savedConversations && Array.isArray(savedConversations) && savedConversations
        .filter(conversation => !conversation.shelved) // Only include non-shelved conversations
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map(conversation => (
          <ConversationButton
            key={conversation.id}
            conversation={conversation}
            onRename={handleRename} // Implement this function
            shareNFT={() => handleMint(conversation.id)} // Adjusted to ensure correct id is passed
            selectConversation={handleConversationSwitch} // Passing loadConversation as selectConversation
            shelveConversation={() => shelveConversation(conversation.id)}
          />
        ))}
    </div>
    <div className="chat-window">
      <div className="chat-header">
        <button className="new-conversation-btn" onClick={startNewConversation} style={{ padding: '5px 10px' }}>
          <FaPencilAlt /> {/* Pencil icon */}
        </button>

        {!accessToken ? (
          <Button type="primary" onClick={connectWallet} style={{ backgroundColor: '#1b72bf' }}>Connect</Button>
        ) : (
          <span style={{ fontSize: '14px' }}>Connected</span>
        )}
      </div>
      <div className="chat-body">
        {messages.map((msg, index) => renderMessage(msg, index))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-footer">
        <textarea
          placeholder={!address ? "Connect a MetaMask wallet" : "Ask anything..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={event => { if (event.key === 'Enter') sendMessage(); }}
          disabled={inputDisabled}
          style={{ width: '100%', padding: '10px', height: '27px' }} // Adjust height as needed
        />
        <button onClick={() => sendMessage()} style={{ backgroundColor: '#1b72bf' }}>
          <i className="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>
  </div>
);
};




export default ChatWindow;
