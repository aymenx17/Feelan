from flask import Flask, request, jsonify
import requests
import urllib.request
import json, copy, time
import os
import ssl
from flask_cors import CORS
from transformers import  AutoTokenizer
from google.cloud import storage
from flask_jwt_extended import JWTManager
from flask_jwt_extended import create_access_token
from flask_jwt_extended import jwt_required, get_jwt_identity
from eth_account.messages import encode_defunct
from eth_account import Account

from prompts import firstPrompt, secondPrompt, thirdPrompt, fourthPrompt, fifthPrompt
from utils import fetchQuote, multiQuote, performSwap, transferERC20
from token_balance import get_account_balance, get_balance

from openai import OpenAI

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

import datetime

os.environ['FLASK_ENV'] = 'development'

app = Flask(__name__)
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'dev_key_please_change_in_production')
jwt = JWTManager(app)

# Initialize OpenAI client with API key from environment variable
client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY", ""),
)

# Configure CORS to allow cross-origin requests with authorization headers
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*", "allow_headers": ["Authorization", "Content-Type"]}})

def get_user_id_key():
    """
    Extract the user ID from the JWT token for rate limiting.
    Falls back to IP address if no user is authenticated.
    """
    user_id = get_jwt_identity()
    if user_id:
        return user_id
    return get_remote_address()

def custom_rate_limit_exceeded(error):
    response = jsonify({
        "success": False,
        "message": "You have exceeded your rate limit. Please try again later."
    })
    response.status_code = 429
    return response

# Initialize rate limiter to prevent abuse
limiter = Limiter(
    get_user_id_key,
    app=app,
    on_breach=custom_rate_limit_exceeded
)

# Initialize tokenizer for input length checking
tokenizer = AutoTokenizer.from_pretrained("HuggingFaceH4/zephyr-7b-beta")

# Configure Google Cloud Storage
bucket_name = 'feelan_storage'
storage_client = storage.Client()
bucket = storage_client.bucket(bucket_name)

@app.route('/')
def index():
    return "Flask server is running!"

@app.route('/api/login', methods=['POST'])
def login():
    """
    Authenticate user with Ethereum wallet signature verification.
    Returns a JWT token for authenticated API access.
    """
    data = request.json
    userId = data.get('userId', None)
    address = userId
    signature = data.get('signature', None)
    message = data.get('message', None)

    if not userId:
        return jsonify({"msg": "Missing userId"}), 400

    # Verify the signature matches the address that signed the message
    encoded_message = encode_defunct(text=message)

    try:
        recovered_address = Account.recover_message(encoded_message, signature=signature)
        if recovered_address.lower() == address.lower():
            access_token = create_access_token(identity=userId, expires_delta=False)
            return jsonify(access_token=access_token)
        else:
            return jsonify({"success": False, "message": "Signature verification failed."}), 400
    except Exception as e:
        return jsonify({"success": False, "message": "An error occurred during signature verification.", "error": str(e)}), 500

def rate_limit_exceeded(error):
    return jsonify({
        "success": False,
        "message": "Rate limit exceeded. Please try again later."
    }), 429

def check_input_length(messages):
    """Count tokens in message to ensure it's within model limits"""
    token_count = 0
    for message in messages:
        tokens = tokenizer.encode(message["content"])
        token_count += len(tokens)

    print(f"Input length: {token_count}")

def role_map(messages):
    """
    Map frontend message roles to OpenAI API format.
    Converts "Me" → "user" and "AI" → "assistant"
    """
    for message in messages:
        if message['role'] not in ["Me", "AI", "user", "assistant"]:
            raise ValueError(f"Invalid role: {message['role']}. Role must be either 'Me' or 'AI'.")

        if message['role'] == "Me":
            message['role'] = "user"
        elif message['role'] == "AI":
            message['role'] = "assistant"

    return messages

# Google Cloud Storage helper functions
def download_blob_as_string(source_blob_name):
    """Downloads a blob from the bucket as a string."""
    blob = bucket.blob(source_blob_name)
    return blob.download_as_string()

def upload_string_as_blob(destination_blob_name, data_string):
    """Uploads a string to a blob."""
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_string(data_string)

def blob_exists(blob_name):
    """Check if a blob exists in the given bucket."""
    blob = bucket.blob(blob_name)
    return blob.exists()

@app.route('/api/meta-update', methods=['POST'])
@jwt_required()
@limiter.limit("10 per minute", key_func=get_user_id_key)
def meta_update():
    """
    Update conversation metadata (name, NFT status, etc.)
    """
    data = request.json
    convId = data['id']
    userId = data['userId']

    bucket_file_path = f"data/users/conversations/{userId}_conversations.json"
    # Load the existing conversations from the Cloud Storage bucket
    if blob_exists(bucket_file_path):
        try:
            json_string = download_blob_as_string(bucket_file_path)
            conversations = json.loads(json_string) if json_string else []
        except FileNotFoundError:
            conversations = []
    else:
        conversations = []

    # Update the conversation in the JSON file
    conversation_updated = False
    for conv in conversations:
        if conv['id'] == convId:
            conv['name'] = data['name']
            conv['isNFT'] = data['isNFT']
            conv['shelved'] = data['shelved']
            conv['tokenURI'] = data['tokenURI']
            conversation_updated = True
            break

    # update on the bucket
    updated_json_string = json.dumps(conversations)
    upload_string_as_blob(bucket_file_path, updated_json_string)

    print(updated_json_string)
    return jsonify({'response': "updated metadata"})

@app.route('/api/retrieveAll', methods=['POST'])
@jwt_required()
@limiter.limit("10 per minute", key_func=get_user_id_key)
def retrieveAll():
    """
    Retrieve all conversations for a user.
    """
    data = request.json
    userId = data['userId']

    # f"data/users/security/monitor/{userId}.json"
    bucket_file_path = f"data/users/conversations/{userId}_conversations.json"
    # Load the existing conversations from the Cloud Storage bucket
    if blob_exists(bucket_file_path):
        try:
            json_string = download_blob_as_string(bucket_file_path)
            conversations = json.loads(json_string) if json_string else []
        except FileNotFoundError:
            conversations = []
    else:
        conversations = []

    return jsonify({'response': conversations})

@app.route('/api/conv-summary', methods=['POST'])
@jwt_required()
@limiter.limit("10 per minute", key_func=get_user_id_key)
def conversation_summary():
    """
    Generate a summary of the conversation using AI.
    Used for creating conversation titles/labels.
    """
    data = request.json
    conversationId = data['conversationId']
    userId = data['userId']

    bucket_file_path = f"data/users/conversations/{userId}_conversations.json"
    # Load the existing conversations from the Cloud Storage bucket
    if blob_exists(bucket_file_path):
        try:
            json_string = download_blob_as_string(bucket_file_path)
            conversations = json.loads(json_string) if json_string else []
        except FileNotFoundError:
            conversations = []
    else:
        conversations = []

    # Check if conversationId exists in conversations
    conversation_data = next((conv for conv in conversations if conv['id'] == conversationId), None)

    # Prepare messages for ML model
    if conversation_data:
        # If conversation exists, use its data
        messages = conversation_data['messages']
        messages_to_call = copy.deepcopy(messages)
        messages_to_call.append({"role": "user", "content": "Make a five words short summary of this conversation fitting in a title."})
    else:
        print("Error in loading the conversation.")

    # Call ML model
    messages_to_call = role_map(messages_to_call)
    check_input_length(messages_to_call)
    ai_response = call_ml_model(messages_to_call)[1:-2]
    # ai_response = response.split("\n<|assistant|>\n")[-1][1:-2]

    # Update the conversation in the JSON file
    conversation_updated = False
    for conv in conversations:
        if conv['id'] == conversationId:
            conv['summary'] = ai_response
            current_conv = conv
            conversation_updated = True
            break

    # Write the updated conversations back to the JSON file
    with open('conversations.json', 'w') as file:
        json.dump(conversations, file, indent=4)
    # Write the updated conversations back to the bucket

    updated_json_string = json.dumps(conversations)
    upload_string_as_blob(bucket_file_path, updated_json_string)

    return jsonify({'response': current_conv})

@app.route('/api/send-message', methods=['POST'])
@jwt_required()
@limiter.limit("50 per hour", key_func=get_user_id_key)
def send_message():
    """
    Main endpoint that handles user messages and AI responses.
    Supports various intents including:
    - Regular chat assistance
    - Token swaps
    - Account balance queries
    - Token transfers
    - Process management
    """
    data = request.json
    userId = data['userId']
    accountAddress = data['accountAddress']
    accountName = data['accountName']
    conversationId = data['conversationId']
    timestamp = data['timestamp']
    message = data['user_message']
    name = data['name']
    isNFT = data['isNFT']
    shelved = data['shelved']
    tokenURI = data['tokenURI']
    type = data['type']
    #userId = "0x39CfBFeCEBb47833393Fd4a8Ce69894D53158A05"

    bucket_file_path = f"data/users/conversations/{userId}_conversations.json"
    # Load the existing conversations from the Cloud Storage bucket
    if blob_exists(bucket_file_path):
        try:
            json_string = download_blob_as_string(bucket_file_path)
            conversations = json.loads(json_string) if json_string else []
        except FileNotFoundError:
            conversations = []
    else:
        conversations = []

    # Check if conversationId exists in conversations
    conversation_data = next((conv for conv in conversations if conv['id'] == conversationId), None)

    # Prepare messages for ML model
    if conversation_data:
        # If conversation exists, use its data
        messages = conversation_data['messages']
        messages.append({"role": "Me", "content": message})
    else:
        # If conversation does not exist, use default data
        messages = [{
                    "role": "Me",
                    "content": message
                    }]

    system_prompt =  {
                    "role": "system",
                    "content": firstPrompt,
                }

    messages_to_call = copy.deepcopy(messages)
    messages_to_call = role_map(messages_to_call)
    messages_to_call.insert(0, system_prompt)
    check_input_length(messages_to_call)

    # Call ML model
    if "Minting NFT" in message:
        ai_response = "NFT minted!"
    elif "New process created!!!" in message:
        conversations.append({
            "id": conversationId,
            "userId": userId,
            "timestamp": timestamp,
            "messages": messages,
            "name": name,
            "isNFT": isNFT,
            "tokenURI": tokenURI,
            "shelved": shelved,
        })

        # Write the updated conversations back to the bucket
        updated_json_string = json.dumps(conversations)
        upload_string_as_blob(bucket_file_path, updated_json_string)
        response_message = "Created a new process."
        return jsonify({'response': response_message})

    else:
        messages_to_call[-1]['content'] = messages_to_call[-1]['content'] + "\nPlease in your response answer with the right format structure, therefore a string-like JSON response."
        raw_response = call_ml_model(messages_to_call)
        print(raw_response)
        ai_response = process_response(raw_response, messages_to_call)
        # ai_response = response.split("<|assistant|>")[-1].lstrip('\n')

    done = False

    intent = ai_response["intent"]
    response = ai_response["response"]
    response_message = "No response"
    print("Intent: ", intent)
    accountTitle = f"On account name: {accountName}"

    #while !done:

    if intent == 'user-assistance':
        response_message = response
        messages.append({"role": "AI", "content": response_message})
        # done = True
    elif intent == 'swap_intent':
        quote_result = fetchQuote(response, accountAddress)
        print("Quote result", quote_result)
        del messages_to_call[0]
        swap_intent_prompt = accountTitle + "\n" +  secondPrompt + quote_result
        messages_to_call.append({'role': 'system', 'content': swap_intent_prompt})
        print("calling with second prompt")
        raw_response = call_ml_model(messages_to_call)
        print(raw_response)
        ai_response = process_response(raw_response, messages_to_call)

        response_message = ai_response['response']
        messages.append({"role": "AI", "content": response_message})
    elif intent == 'multiswap_intent':
        quote_response = multiQuote(response, accountAddress)
        if quote_response.status_code != 200:
            account_balance = get_balance(accountAddress)
            quote_result = f"{quote_response.text}. Consider the user account balance is:\n {account_balance}"
        else:
            quote_result = str(quote_response.json()['results'])
        print("Quote result", quote_result)
        del messages_to_call[0]
        swap_intent_prompt = accountTitle + "\n" +  secondPrompt + quote_result
        messages_to_call.append({'role': 'system', 'content': swap_intent_prompt})
        print("calling with second prompt")
        raw_response = call_ml_model(messages_to_call)
        print(raw_response)
        ai_response = process_response(raw_response, messages_to_call)

        response_message = ai_response['response']
        messages.append({"role": "AI", "content": response_message})
    elif intent == 'swap_function':

        response_back = json.dumps({"intent": "swap_function", "response": response})
        response_message = response_back
        messages.append({"role": "AI", "content": response_message})
    elif intent == 'multiswap_function':
        response_back = json.dumps({"intent": "multiswap_function", "response": response})
        response_message = response_back
        messages.append({"role": "AI", "content": response_message})
        print(response_message)
    elif intent == 'account_balance':
        print('calling get_account_balance')
        account_balance = get_balance(accountAddress)
        print(account_balance)
        del messages_to_call[0]
        balance_prompt = thirdPrompt +  accountTitle + "\n" + account_balance
        messages_to_call.append({'role': 'system', 'content': balance_prompt})
        print("calling with third prompt")
        raw_response = call_ml_model(messages_to_call)
        print(raw_response)
        ai_response = process_response(raw_response, messages_to_call)

        response_message = ai_response['response']
        messages.append({"role": "AI", "content": response_message})
    elif intent == 'transfer_token':
        print('Transfering intent')
        account_balance = get_balance(accountAddress)
        print(account_balance)
        transfer_intent_prompt =  fourthPrompt + accountTitle + "\n" + account_balance
        messages_to_call[0] = {'role': 'system', 'content': transfer_intent_prompt}
        print("calling with forth prompt")
        raw_response = call_ml_model(messages_to_call)
        print(raw_response)
        ai_response = process_response(raw_response, messages_to_call)

        response_message = ai_response['response']
        messages.append({"role": "AI", "content": response_message})
    elif intent == 'transfer_function':
        print('Transfering ERC20 token')
        transfer_result = transferERC20(response, accountAddress)
        if transfer_result["success"]:

            response_back = json.dumps({"intent": "transfer_function", "response": "Transfered"})
            response_message = response_back
            messages.append({"role": "AI", "content": response_message})
            # response_message = "Transfered"
        else:
            error_message = f"Error occured during transfer: {transfer_result['error']}"
            account_balance = get_balance(accountAddress)
            print(account_balance)
            transfer_intent_prompt =  fourthPrompt + accountTitle + "\n" + account_balance + error_message
            del messages_to_call[0]
            messages_to_call.append({'role': 'system', 'content': transfer_intent_prompt})
            print("calling with forth prompt")
            raw_response = call_ml_model(messages_to_call)
            print(raw_response)
            ai_response = process_response(raw_response, messages_to_call)

            response_message = ai_response['response']
            messages.append({"role": "AI", "content": response_message})
    elif intent == 'create-process':
        print("Creating a process")
        print(response)

        response_back = json.dumps({"intent": "create-process", "response": response})
        response_message = response_back
        messages.append({"role": "AI", "content": "creating"})
    elif intent == 'query-process':
        print('Query process')
        print(response)

        response_message = json.dumps({"intent": intent, "response": response})
        messages.append({"role": "AI", "content": "Querying the process."})


    elif intent == 'run-process':
        print('Run process')
        print(response)

        del messages_to_call[0]
        messages_to_call.append({'role': 'system', 'content': fifthPrompt})
        print("calling with fifth prompt")
        raw_response = call_ml_model(messages_to_call)
        print("raw response", raw_response)
        ai_response = process_response(raw_response, messages_to_call)
        print('Running process with: ', ai_response)
        response_message = json.dumps({"intent": ai_response["intent"], "response": ai_response["response"]})
        messages.append({"role": "AI", "content": "running code"})






    # Load the existing conversations from the Cloud Storage bucket
    if blob_exists(bucket_file_path):
        try:
            json_string = download_blob_as_string(bucket_file_path)
            conversations = json.loads(json_string) if json_string else []
        except FileNotFoundError:
            conversations = []
    else:
        conversations = []

    # Update the conversation in the JSON file
    conversation_updated = False
    for conv in conversations:
        if conv['id'] == conversationId:
            conv['messages'] = messages
            conversation_updated = True
            break

    # If the conversation wasn't found, add it as a new conversation
    if not conversation_updated:
        conversations.append({
            "id": conversationId,
            "userId": userId,
            "timestamp": timestamp,
            "messages": messages,
            "name": name,
            "isNFT": isNFT,
            "tokenURI": tokenURI,
            "shelved": shelved,
            "type": type
        })

    # Write the updated conversations back to the bucket

    updated_json_string = json.dumps(conversations)
    upload_string_as_blob(bucket_file_path, updated_json_string)


    return jsonify({'response': response_message})


def is_valid_response(json_data):
    """ Check if the JSON data has the required 'intent' and 'response' keys. """
    return 'intent' in json_data and 'response' in json_data

def process_response(raw_response, messages_to_call, n_trials=3):
    """
    Check if the raw_response is either a valid JSON string or a dict and contains the key fields.
    If not, modify the messages and retry with the ML model up to n_trials times.
    """
    trial = 0
    while trial < n_trials:
        print(f"trial number {trial}")
        try:
            # Check if raw_response is already a dict, if not, parse it
            if isinstance(raw_response, str):
                response_data = json.loads(raw_response)
            elif isinstance(raw_response, dict):
                response_data = raw_response
            else:
                raise ValueError("Unsupported type for raw_response")

            # Check for required fields
            if is_valid_response(response_data):
                return response_data

        except (json.JSONDecodeError, ValueError) as e:
            print(f"Error parsing response: {e}")

        # Update the messages with a system message to prompt for fixing the error.
        del messages_to_call[0]
        prompt = "This is your response: " + str(raw_response)+ "\n Following these instructions: " + firstPrompt  + " However an error was raised, as this could not be read as python dictionary. So please fix the error by including the intent and making it a string-like JSON response."
        messages_to_call.append({'role': 'system', 'content': prompt})

        # Ensure call_ml_model returns a string response
        raw_response = call_ml_model(messages_to_call)
        if isinstance(raw_response, dict):
            raw_response = json.dumps(raw_response)  # Convert dict to JSON string if necessary

        trial += 1

    # If we exhaust n_trials without a valid response, return an error message or None.
    return None


def call_ml_model(message):

    # "gpt-3.5-turbo" "gpt-4-turbo" "gpt-4o-2024-08-06"



    start_time = time.time()  # Start time

    try:

        completion = client.chat.completions.create(
          model="gpt-4-turbo",
          messages= message,
          # max_tokens = 512,
          temperature = 0.7

        )

        # ready message
        ai_message = completion.choices[0].message.content

        end_time = time.time()  # End time
        elapsed_time = end_time - start_time
        print(f"AI response took {round(elapsed_time)} seconds.")

        return ai_message
    except urllib.error.HTTPError as error:
        print("The request failed with status code: " + str(error.code))
        print(error.info())
        print(error.read().decode("utf8", 'ignore'))
        return {'error': 'The request to the ML model failed'}


def allowSelfSignedHttps(allowed):
    # bypass the server certificate verification on client side
    if allowed and not os.environ.get('PYTHONHTTPSVERIFY', '') and getattr(ssl, '_create_unverified_context', None):
        ssl._create_default_https_context = ssl._create_unverified_context


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002)) # 8080
    app.run(debug=True, host='0.0.0.0', port=port)
