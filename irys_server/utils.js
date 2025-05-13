const generateMetadataUri = (walletAddress, accountAddress, accountName, accountDescription) => {
    const metadata = {
        name: accountName,
        description: accountDescription,
        walletAddress: walletAddress,
        accountAddress: accountAddress,
        attributes: []
    };

    // Convert metadata to JSON string
    const metadataString = JSON.stringify(metadata);

    // Mock URI for testing purposes
    const mockUri = `data:application/json;base64,${Buffer.from(metadataString).toString('base64')}`;

    return metadataString;
};

module.exports = {
    generateMetadataUri
};
