import os
import json
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
DATA_FILE = 'reports.json'

# Sicherstellen, dass Ordner und Datei existieren
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'w') as f:
        json.dump([], f)

def get_reports():
    with open(DATA_FILE, 'r') as f:
        return json.load(f)

@app.route('/')
def index():
    reports = get_reports()
    # Sortiert nach neuestem Zeitstempel zuerst
    return render_template('index.html', reports=reversed(reports))

@app.route('/report', methods=['POST'])
def report():
    description = request.form.get('description')
    file = request.files.get('image')
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    filename = ""
    if file:
        filename = f"{datetime.now().timestamp()}_{file.filename}"
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))

    new_report = {
        "timestamp": timestamp,
        "description": description,
        "image": filename
    }

    reports = get_reports()
    reports.append(new_report)
    
    with open(DATA_FILE, 'w') as f:
        json.dump(reports, f, indent=4)

    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True, port=5001)
