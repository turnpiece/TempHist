from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import requests
import os
from dotenv import load_dotenv
from functools import lru_cache

load_dotenv()

app = FastAPI()

# CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "API is running"}

API_KEY = os.getenv("VISUAL_CROSSING_API_KEY")

@lru_cache(maxsize=500)
def fetch_weather(location: str, date: str):
    url = f"https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/{location}/{date}?unitGroup=metric&include=days&key={API_KEY}"
    response = requests.get(url)
    if response.status_code == 200 and 'application/json' in response.headers.get('Content-Type', ''):
        return response.json()
    return {"error": response.text, "status": response.status_code}

@app.get("/weather/{location}/{date}")
def get_weather(location: str, date: str):
    return fetch_weather(location, date)
