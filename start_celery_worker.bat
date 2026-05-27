@echo off
cd /d "%~dp0"
.venv\Scripts\celery.exe -A celery_app worker --pool=solo --loglevel=info -Q celery,default,heavy,periodic >> logs\celery_worker.log 2>&1
