from flask import Flask, send_from_directory
import os

app = Flask(__name__)
BASE = os.path.join(os.path.dirname(__file__), "email-dashboard")

@app.route("/")
def index():
    return send_from_directory(BASE, "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(BASE, path)

if __name__ == "__main__":
    print("🧪 Future Gadget Lab Mail Server gestartet!")
    print("📧 Öffne http://localhost:8765 im Browser")
    print("El Psy Kongroo.")
    app.run(port=8765, debug=False)
