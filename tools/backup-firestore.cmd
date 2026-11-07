@echo off
rem Runs the Firestore backup (for Windows Task Scheduler) and keeps a log.
cd /d "%~dp0.."
if not exist backups mkdir backups
echo ==== %date% %time% >> backups\backup-log.txt
call npm run backup --silent >> backups\backup-log.txt 2>&1
