# Flower Shop Website

## Overview
The Flower Shop Website is a functional e-commerce platform that allows users to browse and purchase a variety of flower products. The website features a responsive design, ensuring a seamless experience across different devices. It includes a basic CRUD (Create, Read, Update, Delete) system for managing flower products.

## Project Structure
```
flowershop-website
├── src
│   ├── index.html          # Main entry point of the website
│   ├── css
│   │   ├── styles.css      # Main styles for the flower shop theme
│   │   └── responsive.css   # Responsive styles for different screen sizes
│   ├── js
│   │   ├── app.js          # Main JavaScript file for application logic
│   │   ├── crud.js         # Functions for CRUD operations on flower products
│   │   └── utils.js        # Utility functions used throughout the application
│   └── pages
│       ├── products.html    # Displays the list of flower products
│       ├── cart.html        # Shows the user's shopping cart
│       └── admin.html       # Admin interface for managing products
├── data
│   └── flowers.json         # JSON file containing flower product data
├── package.json             # npm configuration file
├── .gitignore               # Specifies files to be ignored by Git
└── README.md                # Documentation for the project
```

## Features
- Browse a variety of flower products with detailed descriptions and images.
- Add products to the shopping cart and view selected items.
- Admin interface for managing flower products, including adding, editing, and deleting items.
- Responsive design for optimal viewing on mobile and desktop devices.

## Setup Instructions
1. Clone the repository:
   ```
   git clone <repository-url>
   ```
2. Navigate to the project directory:
   ```
   cd flowershop-website
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Open `src/index.html` in your web browser to view the website.

## Usage
- Users can navigate to the products page to view available flowers and add them to their cart.
- The cart page allows users to review their selected items and proceed to checkout.
- Admins can access the admin page to manage flower products.

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License.