@echo off
REM Lance l'outil de pilotage R&I sur ce poste Windows : base de donnees,
REM application, et premier import si la base est vide.
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo   Outil de pilotage des projets R^&I
echo   ---------------------------------
echo.

REM --- Docker ---------------------------------------------------------------
echo [1/4] Verification de Docker
where docker >nul 2>&1
if errorlevel 1 (
  echo   X Docker n'est pas installe sur ce poste.
  echo     Installez Docker Desktop : https://www.docker.com/products/docker-desktop
  echo     Puis relancez ce fichier.
  pause
  exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
  echo   X Docker est installe mais ne tourne pas.
  echo     Ouvrez Docker Desktop, attendez "Engine running", puis relancez.
  pause
  exit /b 1
)
echo   OK Docker est pret

REM --- Mot de passe ---------------------------------------------------------
REM Le depot est public : la valeur par defaut l'est aussi, et l'application
REM refuse de demarrer avec elle. On en tire un au hasard au premier lancement.
if not exist .env (
  for /f %%p in ('powershell -NoProfile -Command "-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | %%{[char]$_})"') do set MDP=%%p
  copy .env.example .env >nul
  powershell -NoProfile -Command "(Get-Content .env) -replace '^POSTGRES_PASSWORD=.*', 'POSTGRES_PASSWORD=%MDP%' | Set-Content .env"
  echo   OK Fichier .env cree, mot de passe de la base tire au hasard
)

REM --- Demarrage ------------------------------------------------------------
echo.
echo [2/4] Demarrage de l'application
echo     La toute premiere fois, la construction prend quelques minutes.
docker compose up -d --build
if errorlevel 1 (
  echo   X Le demarrage a echoue. Le detail est au-dessus.
  pause
  exit /b 1
)
echo   OK Conteneurs demarres

REM --- Attente --------------------------------------------------------------
echo.
echo [3/4] Attente de l'application
set PRET=0
for /l %%i in (1,1,90) do (
  if !PRET!==0 (
    curl -sf http://localhost:8080/api/sante >nul 2>&1
    if not errorlevel 1 (
      set PRET=1
    ) else (
      timeout /t 1 /nobreak >nul
    )
  )
)
if !PRET!==0 (
  echo   X L'application n'a pas repondu apres 90 secondes.
  echo     Voir les journaux : docker compose logs app
  pause
  exit /b 1
)
echo   OK Application en ligne

REM --- Premier import -------------------------------------------------------
echo.
echo [4/4] Donnees
set XLSX=
set CSV=
for %%f in (donnees-source\*.xlsx) do if not "%%~nf"=="~$" set XLSX=%%~nxf
for %%f in (donnees-source\*.csv) do set CSV=%%~nxf

curl -sf http://localhost:8080/api/projets | findstr /c:"acronyme" >nul 2>&1
if not errorlevel 1 (
  echo   OK Des projets sont deja en base
) else (
  if defined XLSX if defined CSV (
    echo     Import de !XLSX! et !CSV! ...
    docker compose exec -T app node dist/import-adria.js "/app/donnees-source/!XLSX!" "/app/donnees-source/!CSV!" --appliquer
    if errorlevel 1 (
      echo   X L'import a echoue — l'application reste utilisable, base vide.
    ) else (
      echo   OK Donnees chargees
    )
  ) else (
    echo     Base vide, et aucun fichier trouve dans donnees-source\.
    echo     Deposez-y le classeur .xlsx et l'export .csv, puis relancez.
  )
)

echo.
echo   L'outil est accessible sur http://localhost:8080
echo.
echo     Pour l'arreter : docker compose down
echo     Les donnees sont conservees entre deux demarrages.
echo.
start http://localhost:8080
pause
