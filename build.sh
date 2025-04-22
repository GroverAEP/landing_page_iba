#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt

python manage.py collectstatic --noinput
python manage.py migrate

# # Exit on error
# set -o errexit
# # Modify this line as needed for your package manager (pip, poetry, etc.)
# pip install -r requirements.txt
# # Convert static asset files
# python manage.py collectstatic --no-input

# python manage.py makemigrations

# # Apply any outstanding database migrations
# python manage.py migrate

# python manage.py loaddata product_utf8.json

# # python manage.py loaddata data.json
    # # python manage.py loaddata data_utf8.json