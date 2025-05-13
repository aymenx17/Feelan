// ao_processes.js

import axios from 'axios';
const { dryrun } = require('@permaweb/aoconnect');



const arweave_wallet = ""; // TODO: Add your Arweave wallet address here

export const saveChat = async (chat, accessToken) => {
  try {
    const payload = {
      payload: chat
    };

    const config = {
      headers: { Authorization: `Bearer ${accessToken}` }
    };

    const response = await axios.post('http://127.0.0.1:3002/save-chat', payload, config);

    if (response.data.process) {
      return response.data.process; 
    } else {
      throw new Error('Saving chat failed');
    }
  } catch (error) {
    console.error('Error saving chat:', error);
    throw error;
  }
};


export const createProcess = async (address, tags, accessToken) => {
  try {
    const payload = {
      address: address,
      tags: tags
    };

    const config = {
      headers: { Authorization: `Bearer ${accessToken}` }
    };

    const response = await axios.post('http://127.0.0.1:3002/create-process', payload, config);

    if (response.data.process) {
      return response.data.process; // Assuming backend returns a process ID
    } else {
      throw new Error('Process creation failed');
    }
  } catch (error) {
    console.error('Error creating process on backend:', error);
    throw error;
  }
};




export const queryProcess = async (processId, query, accessToken) => {
    try {
      const payload = {
        processId: processId,
        query: query
      };
  
      const config = {
        headers: { Authorization: `Bearer ${accessToken}` }
      };
  
      const response = await axios.post('http://127.0.0.1:3002/query-process', payload, config);
  
      if (response.data.result) {
        return response.data.result; // Assuming the backend returns the result of the query
      } else {
        throw new Error('Query process failed');
      }
    } catch (error) {
      console.error('Error querying process on backend:', error);
      throw error;
    }
  };
  
export const runProcess = async (processId, code, accessToken) => {
    try {
        const payload = {
            processId: processId,
            code: code
        };

        const config = {
            headers: { Authorization: `Bearer ${accessToken}` }
        };

        const response = await axios.post('http://127.0.0.1:3002/run-process', payload, config);

        if (response.data.result) {
            return response.data.result; // Assuming the backend returns the result of the query
        } else {
            throw new Error('Run process failed');
        }
    } catch (error) {
        console.error('Error running process on backend:', error);
        throw error;
    }
};



