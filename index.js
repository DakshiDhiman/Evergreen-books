const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';

const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// -------------------- IMAGE UPLOAD --------------------

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),

    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(
            /[^a-zA-Z0-9._-]/g,
            '_'
        );

        cb(null, `${Date.now()}-${safeName}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },

    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            return cb(null, true);
        }

        cb(new Error('Please upload an image file.'));
    }
});

// -------------------- DATABASE MODEL --------------------

const bookSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    img: {
        type: String,
        default: ''
    }
}, { timestamps: true });

const Book = mongoose.models.Book ||
    mongoose.model('Book', bookSchema);

// -------------------- APP CONFIGURATION --------------------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

app.use(express.urlencoded({ extended: true }));

app.use(session({
    name: 'bookstore.sid',
    secret: process.env.SESSION_SECRET, 
    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 2
    }
}));

app.use((req, res, next) => {
    res.locals.isAdmin = Boolean(req.session.isAdmin);

    const cart = Array.isArray(req.session.cart)
        ? req.session.cart
        : [];

    res.locals.cartCount = cart.reduce(
        (total, item) => total + (Number(item.quantity) || 0),
        0
    );

    next();
});

// -------------------- HELPER FUNCTIONS --------------------

function isAdmin(req, res, next) {
    if (req.session.isAdmin) {
        return next();
    }

    return res.redirect('/admin/login');
}

function asyncRoute(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function validObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

// -------------------- HOME PAGE --------------------

app.get('/', asyncRoute(async (req, res) => {
    const books = await Book.find()
        .sort({ createdAt: -1 })
        .limit(3);

    res.render('home', { books });
}));

// -------------------- ALL BOOKS --------------------

app.get(['/books', '/categories'], asyncRoute(async (req, res) => {
    const books = await Book.find().sort({ createdAt: -1 });

    res.render('books', { books });
}));

// -------------------- CATEGORY PAGES --------------------

app.get('/category', asyncRoute(async (req, res) => {
    const books = await Book.find().sort({
        category: 1,
        title: 1
    });

    res.render('categories', {
        books,
        selectedCategory: ''
    });
}));

app.get('/categories/:category', asyncRoute(async (req, res) => {
    const category = req.params.category;

    const books = await Book.find({
        category: {
            $regex: `^${escapeRegex(category)}$`,
            $options: 'i'
        }
    }).sort({ title: 1 });

    res.render('categories', {
        books,
        selectedCategory: category
    });
}));

// -------------------- ABOUT PAGE --------------------

app.get('/about', (req, res) => {
    res.render('about');
});

// -------------------- CONTACT PAGE --------------------

app.get('/contact', (req, res) => {
    res.render('contact', {
        message: '',
        error: ''
    });
});

app.post('/contact', asyncRoute(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const mob = String(req.body.mob || '').trim();
    const message = String(req.body.message || '').trim();

    if (!name || !email || !message) {
        return res.status(400).render('contact', {
            message: '',
            error: 'Please complete your name, email, and message.'
        });
    }

    const transporter = makeTransporter();

    if (!transporter) {
        return res.status(503).render('contact', {
            message: '',
            error: 'Contact email is not configured yet. Please add EMAIL_USER and EMAIL_PASS to your .env file.'
        });
    }

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        replyTo: email,
        subject: 'New Bookstore Contact Message',
        text:
            `Name: ${name}\n` +
            `Email: ${email}\n` +
            `Mobile: ${mob || 'Not provided'}\n\n` +
            `Message:\n${message}`
    });

    res.render('contact', {
        message: 'Your message has been sent successfully.',
        error: ''
    });
}));

// -------------------- ADMIN LOGIN --------------------


app.get('/admin/login', (req, res) => {
    if (req.session.isAdmin) {
        return res.redirect('/admin');
    }

    res.render('adminlogin', { error: '' });
});

app.post('/admin/login', (req, res, next) => {
    const username = String(req.body.username || '');
    const password = String(req.body.password || '');

    if (
        username !== ADMIN_USERNAME ||
        password !== ADMIN_PASSWORD
    ) {
        return res.status(401).render('adminlogin', {
            error: 'Invalid username or password.'
        });
    }

    req.session.regenerate((error) => {
        if (error) {
            console.error('Session regeneration error:', error);
            return next(error);
        }

        req.session.isAdmin = true;

        req.session.save((saveError) => {
            if (saveError) {
                console.error('Session save error:', saveError);
                return next(saveError);
            }

            res.redirect('/admin');
        });
    });
});

// -------------------- ADMIN LOGOUT --------------------

app.get('/admin/logout', (req, res) => {
    if (!req.session) {
        return res.redirect('/');
    }

    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Logout failed.');
        }

        res.clearCookie('bookstore.sid');
        return res.redirect('/');
    });
});

// -------------------- ADMIN DASHBOARD --------------------

app.get('/admin', isAdmin, asyncRoute(async (req, res) => {
    const books = await Book.find().sort({ createdAt: -1 });

    res.render('admin', { books });
}));

// -------------------- ADD BOOK --------------------

app.get('/books/new', isAdmin, (req, res) => {
    res.render('newbook', { error: '' });
});

app.post(
    '/books/new',
    isAdmin,
    upload.single('img'),
    asyncRoute(async (req, res) => {
        const price = Number(req.body.price);

        if (
            !req.body.title?.trim() ||
            !req.body.author?.trim() ||
            !req.body.category?.trim() ||
            !Number.isFinite(price) ||
            price < 0
        ) {
            return res.status(400).render('newbook', {
                error: 'Enter a title, author, category, and a valid non-negative price.'
            });
        }

        await Book.create({
            title: req.body.title,
            author: req.body.author,
            price,
            category: req.body.category,
            description: req.body.description || '',
            img: req.file
                ? `/uploads/${req.file.filename}`
                : ''
        });

        res.redirect('/admin');
    })
);

// -------------------- EDIT BOOK --------------------

app.get(
    '/books/edit/:id',
    isAdmin,
    asyncRoute(async (req, res) => {
        if (!validObjectId(req.params.id)) {
            return res.status(400).send('Invalid book ID.');
        }

        const book = await Book.findById(req.params.id);

        if (!book) {
            return res.status(404).send('Book not found.');
        }

        res.render('editbook', {
            book,
            error: ''
        });
    })
);

app.post(
    '/books/edit/:id',
    isAdmin,
    upload.single('img'),
    asyncRoute(async (req, res) => {
        if (!validObjectId(req.params.id)) {
            return res.status(400).send('Invalid book ID.');
        }

        const book = await Book.findById(req.params.id);

        if (!book) {
            return res.status(404).send('Book not found.');
        }

        const price = Number(req.body.price);

        if (
            !req.body.title?.trim() ||
            !req.body.author?.trim() ||
            !req.body.category?.trim() ||
            !Number.isFinite(price) ||
            price < 0
        ) {
            return res.status(400).render('editbook', {
                book,
                error: 'Enter a title, author, category, and a valid non-negative price.'
            });
        }

        book.title = req.body.title;
        book.author = req.body.author;
        book.price = price;
        book.category = req.body.category;
        book.description = req.body.description || '';

        if (req.file) {
            book.img = `/uploads/${req.file.filename}`;
        }

        await book.save();

        res.redirect('/admin');
    })
);

// -------------------- DELETE BOOK --------------------

app.post(
    '/books/delete/:id',
    isAdmin,
    asyncRoute(async (req, res) => {
        if (!validObjectId(req.params.id)) {
            return res.status(400).send('Invalid book ID.');
        }

        const book = await Book.findByIdAndDelete(req.params.id);

        if (!book) {
            return res.status(404).send('Book not found.');
        }
        if (Array.isArray(req.session.cart)) {
            req.session.cart = req.session.cart.filter(
                item => item.bookId !== req.params.id
            );
        }

        res.redirect('/admin');
    })
);

 
 //                    SHOPPING CART
 

// Add a book to the cart without leaving the current page.
app.post('/cart/add', asyncRoute(async (req, res) => {
    try {
        console.log('Cart form data:', req.body);
        const bookId = String(req.body.bookId || '').trim();

        if (!mongoose.isValidObjectId(bookId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid book ID. Please try again.'
            });
        }

        const book = await Book.findById(bookId);

        if (!book) {
            return res.status(404).json({
                success: false,
                message: 'Book not found.'
            });
        }

        if (!Array.isArray(req.session.cart)) {
            req.session.cart = [];
        }

        const existingItem = req.session.cart.find(
            item => String(item.bookId) === bookId
        );

        if (existingItem) {
            existingItem.quantity =
                (Number(existingItem.quantity) || 0) + 1;
        } else {
            req.session.cart.push({
                bookId: bookId,
                quantity: 1
            });
        }

        req.session.save(err => {
            if (err) {
                console.error('Cart session save error:', err);

                return res.status(500).json({
                    success: false,
                    message: 'Unable to save your cart. Please try again.'
                });
            }

            return res.status(200).json({
                success: true,
                message: `${book.title} added to your cart!`,
                cartCount: req.session.cart.reduce(
                    (sum, item) => sum + item.quantity, 0
                )
            });
        });

    } catch (error) {
        console.error('Add-to-cart error:', error);

        return res.status(500).json({
            success: false,
            message: 'An error occurred while adding this book.'
        });
    }
}));

// Display the cart page.
app.get('/cart', asyncRoute(async (req, res) => {
    const sessionCart = Array.isArray(req.session.cart)
        ? req.session.cart
        : [];

    const cartItems = [];
    const validCart = [];

    for (const item of sessionCart) {
        if (!mongoose.isValidObjectId(item.bookId)) {
            continue;
        }

        const book = await Book.findById(item.bookId);

        if (!book) {
            continue;
        }

        const quantity = Math.max(
            1,
            Math.floor(Number(item.quantity) || 1)
        );

        validCart.push({
            bookId: book._id.toString(), 
            quantity
        });

        cartItems.push({
            book: book,
            quantity: quantity,
            subtotal: book.price * quantity
        });
    }

    req.session.cart = validCart;

    const total = cartItems.reduce(
        (sum, item) => sum + item.subtotal,
        0
    );

    const message = req.session.cartMessage || '';
    delete req.session.cartMessage;

    res.render('cart', {
        cartItems,
        total,
        message
    });
}));

// Remove a book from the cart.
app.post('/cart/remove/:bookId', (req, res) => {
    const bookId = req.params.bookId;

    if (!mongoose.isValidObjectId(bookId)) {
        return res.status(400).send('Invalid book ID.');
    }

    if (Array.isArray(req.session.cart)) {
        req.session.cart = req.session.cart.filter(
            item => String(item.bookId) !== bookId
        );
    }

    req.session.cartMessage = 'Book removed from your cart.';

    res.redirect('/cart');
});

// -------------------- ERROR HANDLER --------------------

app.use((error, req, res, next) => {
    console.error(error);

    if (res.headersSent) {
        return next(error);
    }

    if (error instanceof multer.MulterError) {
        return res.status(400).send(
            'Image upload failed. Please use an image smaller than 5 MB.'
        );
    }

    if (error.message === 'Please upload an image file.') {
        return res.status(400).send(error.message);
    }

    res.status(500).send(
        'Something went wrong. Check the terminal for details.'
    );
});

// -------------------- START SERVER --------------------

async function startServer() {
    try {
        await mongoose.connect(
            process.env.MONGODB_URI
        );

        console.log('MongoDB connected successfully.');

        app.listen(PORT, () => {
            console.log(
                `Bookstore running at http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error(
            'Database connection failed:',
            error.message
        );

        process.exit(1);
    }
}

startServer();