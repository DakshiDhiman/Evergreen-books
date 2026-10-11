BOOKSTORE PROJECT — SETUP

Requirements:
1. Node.js installed
2. MongoDB installed and running locally (or update MONGODB_URI in .env)

SETUP:
1. Extract this ZIP.
2. Open the extracted Bookstore_Complete_Project folder in VS Code.
3. In the terminal, run:
   npm install
4. Copy .env.example to a new file named .env.
   On Windows PowerShell:
   Copy-Item .env.example .env
5. Open .env and change SESSION_SECRET to a long random value.
6. Optional email: set EMAIL_USER to your Gmail address and EMAIL_PASS to a Google App Password. Do not use your normal Gmail password. If you don't configure email, the rest of the website still works; contact form will display a configuration message.
7. Make sure MongoDB is running.
8. Run:
   npm start
9. Open:
   http://localhost:3000

DEFAULT LOCAL ADMIN LOGIN:
Username: admin
Password: admin1234

IMPORTANT:
- Change the default admin username/password in .env before deploying online.
- Never upload .env or email credentials to GitHub.
- Uploads are saved in the uploads folder.
- This starter project uses Tailwind's browser CDN for simple setup. For a production site, build Tailwind locally.
- The admin login is suitable as a coursework/demo starter, not a hardened production authentication system.
