@echo off
cd /d "%~dp0"
set CELERY_BEAT_ENABLED=true
.venv\Scripts\celery.exe -A celery_app beat --loglevel=info >> logs\celery_beat.log 2>&1
