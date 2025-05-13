import React, { useState } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { MetaMaskConnector } from 'wagmi/connectors/metaMask';
import { Button } from 'antd';
import useLit from './lit_index';
import axios from 'axios'; // Ensure axios is installed: npm install axios







export const fetchIrys = async (receiptId, decryptFile) => {
    try {
      const payload = { receiptId: receiptId };
      const response = await fetch('http://localhost:3002/fetch-transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const fileList = await response.json();
      if (response.ok && fileList.success && fileList.transactions.length > 0) {
        const lastFile = fileList.transactions[fileList.transactions.length - 1];
        const fileData = new Uint8Array(lastFile.data.data);
        const fileBlob = new Blob([fileData], { type: 'application/octet-stream' });
  
        const decryptedData = await decryptFile({ file: fileBlob });
        if (decryptedData) {
          const { decryptedFile } = decryptedData;
          const blob = new Blob([decryptedFile], { type: 'text/plain' });
  
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function (e) {
              try {
                // Assuming the content is a JSON object, parse it first
                const jsonObject = JSON.parse(e.target.result);
          
                // Convert the JSON object to a string
                const stringifiedObject = JSON.stringify(jsonObject, null, 2);
                resolve(stringifiedObject);
              } catch (parseError) {
                reject(new Error("Failed to parse the decrypted file as JSON"));
              }
            };
            reader.onerror = () => reject(new Error("Failed to read the file"));
            reader.readAsText(blob);
          });
        } else {
          throw new Error("Decryption failed");
        }
      } else {
        throw new Error(fileList.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      throw error; // Rethrow the error for the caller to handle
    }
  };




export const uploadToIrys = async (encryptedFile) => {
    try {
      // Create a new FormData instance
      const formData = new FormData();
      // Append the encrypted file to the form data
      formData.append('encryptedFile', encryptedFile);
  
      // Make the POST request
      const response = await fetch('http://localhost:3002/upload', {
        method: 'POST',
        body: formData // Send the form data
      });
  
      const receipt = await response.json();
      if (response.ok) {
        console.log('Data uploaded:', receipt);
        return receipt;
      } else {
        throw new Error(receipt.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error uploading data:', error);
      alert('Error uploading data. See console for details.');
    }
};

export const handleSave = async (conv, encryptFile, userId) => {
    // Convert text to Blob and then to File
    const file = new File([new Blob([conv], { type: 'application/json' })], 'data.json');
    const userAddress = userId;

    // Define your access control conditions here
    const conditions =  [{
      conditionType: "evmBasic",
      contractAddress: "",
      standardContractType: "",
      chain: "ethereum",
      method: "",
      parameters: [
        ":userAddress",
      ],
      returnValueTest: {
        comparator: "=",
        value: userAddress,
      },
    }];

     // Encrypt the file
     const encryptedData =  await encryptFile({ file, conditions });
     if (encryptedData) {
       const { encryptedFile } = encryptedData;
       const receipt = await uploadToIrys(encryptedFile); // Await the receipt from uploadToIrys
       return receipt; // Return the receipt

    }   
};


export const storeArweave = async (conv) => {
  // Convert text to Blob and then to File
  const file = new File([new Blob([conv], { type: 'application/json' })], 'data.json');


  const receipt = await uploadToIrys(file); // Await the receipt from uploadToIrys
  return receipt; // Return the receipt

  
};


export const fetchConversationSummary = async (conversationId, userId, config) => {
  try {

    const response = await axios.post('http://127.0.0.1:5002/api/conv-summary', {conversationId: conversationId, userId: userId }, config);
    return response.data.response; // Assuming the response contains a 'summary' field .slice(0, 45)
  } catch (error) {
    console.error('Error fetching conversation summary:', error);
    return null;
  }
};