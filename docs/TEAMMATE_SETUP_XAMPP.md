# Running COC LMS on XAMPP — Setup Guide for Teammates

This project was developed on Laragon (MySQL 8.4) but runs fine on plain
XAMPP. Follow these steps exactly and it will work.

---

## 1. Install XAMPP
Download from https://www.apachefriends.org if you don't have it. Make sure
**Apache** and **MySQL** are both installed (default options are fine).

## 2. Place the project
Copy the whole project folder into your XAMPP `htdocs` folder so the path is:

```
C:\xampp\htdocs\COC_LMS(2)\
```

The folder name **must** be `COC_LMS(2)` (matches `BASE_URL` in the config —
see step 4). If you want a different folder name, update `BASE_URL` in your
`.env` to match.

## 3. Start Apache and MySQL
Open the XAMPP Control Panel → click **Start** next to both Apache and MySQL.
Both status lights should turn green.

## 4. Set up your `.env` file
In the project root, copy `.env.example` to a new file named `.env`:

```
copy .env.example .env
```

Open `.env` and fill in at minimum:
```
DB_HOST=127.0.0.1
DB_NAME=cit_lms
DB_USER=root
DB_PASS=
DB_PORT=3306
JWT_SECRET=<generate one — see below>
```

Generate a `JWT_SECRET` by running this in a terminal with PHP available:
```
php -r "echo bin2hex(random_bytes(32));"
```
Paste the output in as `JWT_SECRET=...`.

*(Email/Groq AI settings are optional for local testing — the app runs fine
without them; those features just won't send real emails or generate AI
content until configured.)*

## 5. Import the database
Open **phpMyAdmin** (`http://localhost/phpmyadmin`) → click **New** on the
left sidebar → name the database `cit_lms` → click **Create**.

Then click into the `cit_lms` database → **Import** tab → choose file →
select:
```
database/cit_lms_teammate_import.sql
```
→ click **Go**.

This file was exported specifically for XAMPP/MariaDB compatibility — don't
use the other `.sql` files in `database/backups/` or `database/archive/` for
this, they may contain MySQL-8-only collations that MariaDB can't import.

## 6. Open the app
Visit:
```
http://localhost/COC_LMS(2)/
```

Log in with the seeded admin account (check with whoever ran the export for
current credentials, or use the Register Here flow to create a fresh
account).

---

## Troubleshooting

**"Unknown collation" error when importing the SQL file**
You used the wrong `.sql` file — make sure it's specifically
`database/cit_lms_teammate_import.sql`, not a backup/archive dump.

**Blank white page / PHP errors on screen**
Check `php.ini` in XAMPP has these extensions enabled (uncomment the `;` if
present): `extension=pdo_mysql`, `extension=mysqli`, `extension=curl`,
`extension=mbstring`, `extension=openssl`. Restart Apache after any change.

**"Access denied" connecting to MySQL**
XAMPP's default MySQL root user has no password. If yours does, update
`DB_PASS` in `.env` to match.

**Port 80 or 3306 already in use**
Something else on your PC (often Skype, IIS, or another local server) is
using that port. Either close it, or change Apache/MySQL's port in the XAMPP
Control Panel → Config, and update `DB_PORT` in `.env` to match if you
changed MySQL's port.
