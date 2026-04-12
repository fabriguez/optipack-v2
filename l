# Cloner le repo
cd /opt
git clone git@github.com:BrightkyEfoo/optipack-v2.git
cd optipack-v2

# Creer le .env de production
cp .env.example .env
nano .env  # remplir les vraies valeurs

# Premier lancement
docker compose -f docker-compose.prod.yml up -d
