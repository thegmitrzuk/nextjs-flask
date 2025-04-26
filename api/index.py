from flask import Flask, request, jsonify
app = Flask(__name__)

@app.route("/api/python")
def hello_world():
    return "<p>Hello, World!</p>"

@app.route("/api/add", methods=['POST'])
def add_numbers():
    data = request.get_json()
    num1 = float(data.get('num1', 0))
    num2 = float(data.get('num2', 0))
    result = num1 + num2
    return jsonify({"result": result})