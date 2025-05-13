import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FaCog } from 'react-icons/fa';

const ProcessesUI = ({ address, accessToken, selectConversation, createNewConversation }) => {
    const [processes, setProcesses] = useState([]);
    const [newProcessName, setNewProcessName] = useState('');

    useEffect(() => {
        const fetchProcesses = async () => {
            try {
                const config = {
                    headers: { Authorization: `Bearer ${accessToken}` }
                };
                const response = await axios.post('http://127.0.0.1:3002/getProcesses', { address }, config);
                setProcesses(response.data.processes || []);
            } catch (error) {
                console.error('Error fetching processes:', error);
                setProcesses([]);
            }
        };

        if (accessToken) {
            fetchProcesses();
        }
    }, [accessToken, address]);

    const createProcess = async (address, name, tags) => {
        try {
            const config = {
                headers: { Authorization: `Bearer ${accessToken}` }
            };
            const response = await axios.post('http://127.0.0.1:3002/create-process', { address, name, tags }, config);
            setProcesses([...processes, response.data.process]);
        } catch (error) {
            console.error('Error creating process:', error);
        }
    };

    const handleCreateProcess = () => {
        const tags = [
            { name: 'Name', value: newProcessName }
            // Additional tags can be added here if necessary
        ];
        createProcess(address, newProcessName, tags);
    };

    return (
        <div className="processes-ui">
            <div className="processes-list">
                {Array.isArray(processes) && processes.map((process) => (
                    <button 
                        key={process.processId} 
                        className="process-button" 
                        onClick={() => selectConversation(process.processId)}
                    >
                        <FaCog /> {process.name}
                    </button>
                ))}
            </div>
            <div className="create-process">
                <input
                    type="text"
                    placeholder="New Process Name"
                    value={newProcessName}
                    onChange={(e) => setNewProcessName(e.target.value)}
                />
                <button onClick={handleCreateProcess}>Create Process</button>
            </div>
        </div>
    );
};

export default ProcessesUI;
