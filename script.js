// Menu Data Container
let menuData = [];

// Cart State
let cart = [];
let pendingItem = null; // Item waiting for option selection

document.addEventListener('DOMContentLoaded', () => {
    // Navbar Toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (navToggle) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = navToggle.querySelector('i');
            if (navLinks.classList.contains('active')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    }

    // Smooth Scroll for Anchors
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            navLinks.classList.remove('active'); // Close mobile menu if open
            if (navToggle) {
                navToggle.querySelector('i').classList.remove('fa-times');
                navToggle.querySelector('i').classList.add('fa-bars');
            }

            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Render Menu
    const menuContainer = document.getElementById('menu-container');
    const filterBtns = document.querySelectorAll('.filter-btn');

    function formatPrice(price) {
        // Handle string or number input
        const numPrice = parseFloat(price);
        return `$${numPrice.toFixed(2)}`;
    }

    function renderMenu(category = 'favoritos') {
        menuContainer.innerHTML = '';

        let filteredItems;
        if (category === 'favoritos') {
            filteredItems = menuData.filter(item => item.popular);
        } else if (category === 'all') {
            // Fallback if needed, though 'all' button is gone
            filteredItems = menuData;
        } else {
            filteredItems = menuData.filter(item => item.category === category);
        }

        if (filteredItems.length === 0) {
            menuContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #ccc;">No hay platillos disponibles en esta categoría.</p>';
            return;
        }

        filteredItems.forEach((item, index) => {
            const menuItem = document.createElement('div');
            menuItem.className = 'menu-item fade-in';
            menuItem.style.animationDelay = `${index * 0.05}s`; // Staggered animation

            const imageHtml = item.image ? `<img src="${item.image}" alt="${item.title}" class="menu-item-image">` : '';

            menuItem.innerHTML = `
                ${imageHtml}
                <div class="menu-item-header">
                    <h3 class="menu-title">${item.title}</h3>
                    <span class="menu-price">${formatPrice(item.price)}</span>
                </div>
                <p class="menu-desc">${item.description}</p>
                ${item.popular ? '<div style="position:absolute; top:0; right:0; background:var(--accent-green); color:white; font-size:0.7rem; padding:4px 10px; font-weight:bold; border-bottom-left-radius: 8px;">FAVORITO</div>' : ''}
                <div class="add-to-cart-container">
                    <button class="add-to-cart-btn" onclick="addToCart(${item.id})">
                        <i class="fas fa-plus"></i> Agregar
                    </button>
                </div>
            `;

            menuContainer.appendChild(menuItem);

            // Trigger reflow to restart animation
            void menuItem.offsetWidth;
            menuItem.classList.add('visible');
        });
    }

    // Menu Filtering
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            filterBtns.forEach(b => b.classList.remove('active'));
            // Add active class to clicked
            btn.classList.add('active');

            const filter = btn.getAttribute('data-filter');
            renderMenu(filter);
        });
    });

    // Init Menu (Fetch from Backend)
    menuContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Cargando menú...</p>';
    fetch('/api/menu')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            menuData = data;
            renderMenu('favoritos');
        })
        .catch(error => {
            console.error('Error fetching menu:', error);
            menuContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: red;">Error al cargar el menú. Por favor, intenta de nuevo más tarde.</p>';
        });
    // Options Modal Elements
    const optionsModal = document.getElementById('options-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalOptionsContainer = document.getElementById('modal-options-container');

    window.closeOptionsModal = function () {
        optionsModal.classList.remove('active');
        pendingItem = null;
    };

    function openOptionsModal(item) {
        pendingItem = item;
        modalTitle.textContent = `Elige opción para: ${item.title}`;
        modalOptionsContainer.innerHTML = '';

        item.options.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = option;
            btn.onclick = () => confirmOption(option);
            modalOptionsContainer.appendChild(btn);
        });

        optionsModal.classList.add('active');
    }

    function confirmOption(option) {
        if (pendingItem) {
            addToCartInternal(pendingItem, option);
            closeOptionsModal();
        }
    }

    // Cart Elements
    const cartBtn = document.getElementById('cart-btn');
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');
    const closeCartBtn = document.getElementById('close-cart');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalPrice = document.getElementById('cart-total-price');
    const cartCount = document.querySelector('.cart-count');
    const checkoutBtn = document.getElementById('checkout-btn');
    const toast = document.getElementById('toast');

    // Toggle Cart
    function toggleCart() {
        cartSidebar.classList.toggle('active');
        cartOverlay.classList.toggle('active');
    }

    cartBtn.addEventListener('click', toggleCart);
    closeCartBtn.addEventListener('click', toggleCart);
    cartOverlay.addEventListener('click', toggleCart);

    // Add to Cart (Global function)
    window.addToCart = function (id) {
        const item = menuData.find(i => i.id === id);
        if (!item) return;

        if (item.options && item.options.length > 0) {
            openOptionsModal(item);
        } else {
            addToCartInternal(item);
        }
    };

    function addToCartInternal(item, variant = null) {
        // Build a unique key for comparison (id + variant)
        const existingItemIndex = cart.findIndex(i => i.id === item.id && i.variant === variant);

        if (existingItemIndex > -1) {
            cart[existingItemIndex].quantity += 1;
        } else {
            cart.push({ ...item, quantity: 1, variant: variant });
        }

        updateCartUI();
        const toastMsg = variant ? `${item.title} (${variant})` : item.title;
        showToast(`Agregado: ${toastMsg}`);
    }

    // Remove from Cart (By Index)
    window.removeFromCart = function (index) {
        if (cart[index].quantity > 1) {
            cart[index].quantity -= 1;
        } else {
            cart.splice(index, 1);
        }
        updateCartUI();
    };

    // Increase Quantity (By Index)
    window.increaseQty = function (index) {
        cart[index].quantity += 1;
        updateCartUI();
    };

    function updateCartUI() {
        // Update Count
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCount.textContent = totalItems;

        // Update Total Price
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotalPrice.textContent = formatPrice(total);

        // Render Items
        cartItemsContainer.innerHTML = '';
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<div class="empty-cart-msg">Tu carrito está vacío</div>';
            return;
        }

        cart.forEach((item, index) => {
            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';

            const titleDisplay = item.variant
                ? `${item.title} <br><span style="font-size:0.8em; color:var(--text-muted);">(${item.variant})</span>`
                : item.title;

            cartItem.innerHTML = `
                <div class="cart-item-info">
                    <h4>${titleDisplay}</h4>
                    <p>${formatPrice(item.price)} x ${item.quantity} = ${formatPrice(item.price * item.quantity)}</p>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="removeFromCart(${index})"><i class="fas fa-minus"></i></button>
                    <span class="cart-item-qty">${item.quantity}</span>
                    <button class="qty-btn" onclick="increaseQty(${index})"><i class="fas fa-plus"></i></button>
                </div>
            `;
            cartItemsContainer.appendChild(cartItem);
        });
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Checkout (Mercado Pago)
    checkoutBtn.addEventListener('click', async () => {
        if (cart.length === 0) {
            showToast('Agrega productos antes de pedir');
            return;
        }

        const originalText = checkoutBtn.innerHTML;
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
        checkoutBtn.disabled = true;

        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cart })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al procesar el pago');
            }

            const data = await response.json();

            // Redirect to Mercado Pago Checkout Pro
            if (data.init_point) {
                window.location.href = data.init_point;
            } else {
                throw new Error('No se recibió la URL de pago');
            }

        } catch (error) {
            console.error('Checkout error:', error);
            showToast('Hubo un error al procesar tu pago. Intenta de nuevo.');
            checkoutBtn.innerHTML = originalText;
            checkoutBtn.disabled = false;
        }
    });

    // Initial render
    renderMenu();

    // Intersection Observer for Scroll Animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in, .fade-in-up, .fade-in-left, .fade-in-right').forEach(el => {
        observer.observe(el);
    });

    // Navbar Background on Scroll
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.padding = '10px 0';
            navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
        } else {
            navbar.style.padding = '20px 0';
            navbar.style.boxShadow = 'none';
        }
    });
});
