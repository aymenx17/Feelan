import React, { useState, useEffect } from 'react';
import { FaEllipsisV, FaEdit, FaCog } from 'react-icons/fa';

const ConversationButton = ({ conversation, onRename, shareNFT, selectConversation, shelveConversation }) => {
    const [menuVisible, setMenuVisible] = useState(false);

    // Function to toggle the menu visibility
    const toggleMenu = (e) => {
        e.stopPropagation(); // Prevent the click from affecting parent elements
        setMenuVisible(!menuVisible);
    };

    // Hide menu when clicking anywhere else in the document
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuVisible && !event.target.closest('.conversation-options')) {
                setMenuVisible(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [menuVisible]);

    const copyProcessId = (processId) => {
        navigator.clipboard.writeText(processId)
          .then(() => {
            console.log('Process ID copied to clipboard');
            alert('Process ID copied to clipboard');
          })
          .catch(err => {
            console.error('Failed to copy process ID: ', err);
          });
      };


      return (
        <div className="conversation-button-container" onMouseLeave={() => setMenuVisible(false)}>
          <button className="conversation-button" onClick={() => selectConversation(conversation.id)}>
            {conversation.type === "process" ? <FaCog className="icon" /> : null}
            {conversation.name || "New chat"}
          </button>
          <div className="conversation-options">
            {!menuVisible && <FaEllipsisV className="conversation-dots" onClick={toggleMenu} />}
            {menuVisible && (
              <div className="conversation-menu" onMouseEnter={() => setMenuVisible(true)}>
                <ul>
                  <li onClick={() => onRename(conversation.id)}> <FaEdit /> Rename </li>
                  <li onClick={shelveConversation}>Shelve</li>
                  {conversation.isNFT ? (
                    <li className="nft-shared">Shared as NFT</li>
                  ) : (
                    <li onClick={() => shareNFT(conversation.id)}>Share as NFT</li>
                  )}
                  {conversation.type === "process" && (
                    <li onClick={() => copyProcessId(conversation.id)}>Copy Process ID</li>
                  )}
                  {/* Add more menu items here */}
                </ul>
              </div>
            )}
          </div>
        </div>
      );
    };



export default ConversationButton;
