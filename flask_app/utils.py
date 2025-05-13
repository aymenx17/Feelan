import requests
import decimal
import json

chainId = 137





# def smart_round(value, sig_digits=3):
#     """ Rounds numbers intelligently based on their magnitude. """
#     # Converts the value to a Decimal for high precision calculations
#     d = decimal.Decimal(value)
#     # Round the number to the significant digits
#     return round(d, sig_digits - decimal.Decimal(value).adjusted() - 1)
def smart_round(value, sig_digits=3):
    """ Rounds numbers intelligently based on their magnitude and ensures the result is not higher than the original. """
    d = decimal.Decimal(value)
    # Calculate the target precision
    precision = sig_digits - d.adjusted() - 1
    rounded_value = round(d, precision)
    # Check if rounding exceeds the original and adjust if necessary
    if rounded_value > d:
        rounded_value = round(d, precision - 1)
    return rounded_value

def transferERC20(data, accountAddress):
    url = 'http://localhost:3002/transferERC20'

    tokenInAddress = get_token_address(data['tokenIn'])
    amount = str(data['amount'])
    recipient = data['recipient']

    data = {
        'accountAddress': accountAddress,
        'tokenInAddress': tokenInAddress,
        'amount': amount,
        'recipient': recipient
    }

    try:
        response = requests.post(url, json=data)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        return {'success': False, 'error': response.json()['error'].split('Details')[-1]}


def multiSwap(data):

    url = 'http://localhost:3000/multiSwap'

    swaps = data['swaps']

    response = requests.post(url, json={"swaps": swaps})

    if response.status_code == 200:
        print("Transaction receipt:", response.json()["receipt"])
    else:
        print("Error:", response.json()["error"])


def multiQuote(quotes, accountAddress):
    url = 'http://localhost:3002/multiQuote'

    # Example list of swap data
    quote_request = []
    for quote in quotes:
        quote["walletAddress"] = accountAddress
        quote["chainId"] = 137
        quote['amountIn'] = quote['amount']
        tokenInAddress = get_token_address(quote['tokenIn'])
        tokenOutAddress = get_token_address(quote['tokenOut'])
        quote['tokenInAddress'] = tokenInAddress
        quote['tokenOutAddress'] = tokenOutAddress
        quote_request.append(quote)

    headers = {
    'Content-Type': 'application/json',
    }
    data = {
        'swaps': quote_request
    }
    response = requests.post(url, headers=headers, data=json.dumps(data))

    if response.status_code == 200:
        return response
    else:
        print(f"Error: {response.status_code}, {response.text}")
        return  response



def fetchQuote(response, accountAddress):
    url = 'http://localhost:3002/quote'  # The URL of your Node.js server endpoint


    data = response


    tokenInAddress = get_token_address(data['tokenIn'])
    tokenOutAddress = get_token_address(data['tokenOut'])
    amount = data['amount']

    # Prepare the data payload
    data = {
        'chainId': chainId,
        'walletAddress': accountAddress,
        'tokenInAddress': tokenInAddress,
        'tokenOutAddress': tokenOutAddress,
        'amountIn': amount
    }

    try:
        # Make the POST request
        print("calling url", {url})
        response = requests.post(url, json=data)

        # Check if the request was successful
        if response.status_code == 200:
            response_data = response.json()

            # Extract and round the relevant fields
            estimated_output = smart_round(response_data.get('estimatedOutput', 'N/A'))
            gas_adjusted_quote = smart_round(response_data.get('gasAdjustedQuote', 'N/A'))
            gas_used_quote_token = smart_round(response_data.get('gasUsedQuoteToken', 'N/A'), 3)
            gas_used_usd = smart_round(response_data.get('gasUsedUSD', 'N/A'), 3)
            balance_token_in = response_data.get('balanceTokenIn', 'N/A')
            balance_token_out = response_data.get('balanceTokenOut', 'N/A')
            token_in = response_data.get('tokenIn', 'N/A')
            token_out = response_data.get('tokenOut', 'N/A')
            # gas_used = response_data.get('gasUsed', 'N/A')
            # gas_price_wei = response_data.get('gasPriceWei', 'N/A')


            # Merge all variables into one string
            result = (
                f"{amount} {token_in} for {estimated_output} {token_out}\n"
                f"Gas Adjusted Quote: {gas_adjusted_quote}\n"
                f"Gas Used (USD): {gas_used_usd}\n"
                f"This account has a balance of {balance_token_in} {token_in} \n"
                f"And a balance of {balance_token_out} {token_out} \n"

            )
            print(result)
            return result
        else:
            return f"{response.text}"

    except requests.exceptions.RequestException as e:
        # Handle any errors that occur during the request
        return f"An error occurred: {str(e)}"



def performSwap(response, accountAddress):
    url = 'http://localhost:3002/swap'  # Adjust the URL based on your actual server URL and port

    data = response


    tokenInAddress = get_token_address(data['tokenIn'])
    tokenOutAddress = get_token_address(data['tokenOut'])
    amount = str(data['amount'])

    # Prepare the data payload
    data = {
        'chainId': chainId,
        'walletAddress': accountAddress,
        'tokenInAddress': tokenInAddress,
        'tokenOutAddress': tokenOutAddress,
        'amountIn': amount
    }

    # Convert data to JSON
    headers = {'Content-Type': 'application/json'}

    try:
        # Make the POST request
        response = requests.post(url, data=json.dumps(data), headers=headers)

        # Check if the request was successful
        if response.status_code == 200:
            # Process the response if needed or return it
            print("Swap performed successfully:", response.json())
            return response.json()
        else:
            print("Failed to perform swap with status code", response.status_code)
            return response.text
    except requests.exceptions.RequestException as e:
        # Handle any connection errors
        print("An error occurred:", str(e))
        return None


def get_token_address(symbol, filename="valid_tokens.json"):
    # Load the JSON data from the file
    try:
        with open(filename, 'r') as file:
            tokens = json.load(file)

        # Search for the token by symbol and return its address
        for token in tokens:
            if token['symbol'] == symbol:
                return token['address']

        # If the symbol was not found, return an informative message
        return "Token symbol not found."
    except FileNotFoundError:
        return "The file was not found."
    except json.JSONDecodeError:
        return "Error decoding JSON."
    except Exception as e:
        return f"An error occurred: {str(e)}"
