const authModule = (() => {
    const getDb = () => (typeof db !== 'undefined' ? db : null);

    const getLoginUrl = () => {
        const path = window.location.pathname;
        return path.includes('/pages/') ? 'login.html' : 'pages/login.html';
    };

    const register = (name, email, password) => {
        return firebase.auth()
            .createUserWithEmailAndPassword(email, password)
            .then(result => {
                return firebase.database().ref('users/' + result.user.uid).set({
                    name:      name.trim(),
                    email:     email,
                    role:      'user',
                    createdAt: new Date().toISOString()
                }).then(() => ({ user: result.user, role: 'user' }));
            });
    };

    const login = (email, password) => {
        return firebase.auth().signInWithEmailAndPassword(email, password);
    };

    const logout = () => {
        localStorage.removeItem('rv_guest');
        localStorage.removeItem('flowershop_cart');
        localStorage.removeItem('flowershop_wishlist');
        localStorage.removeItem('rv_nav_cache');
        localStorage.removeItem('rv_nav_guest');
        _clearLastActive();
        return firebase.auth().signOut().then(() => {
            window.location.href = getLoginUrl();
        });
    };

    const continueAsGuest = () => {
        localStorage.setItem('rv_guest', 'true');
        const isInPages = window.location.pathname.includes('/pages/');
        window.location.href = isInPages ? '../index.html' : 'index.html';
    };

    const getCurrentUser = () => firebase.auth().currentUser;

    const getUserData = (uid) => {
        const database = getDb();
        if (!database) return Promise.resolve(null);
        return database.ref('users/' + uid).once('value').then(snap => snap.val());
    };

    const onAuthChange = (callback) => firebase.auth().onAuthStateChanged(callback);

    const requireAdmin = (mainContentId) => {
        const main = mainContentId ? document.getElementById(mainContentId) : null;
        if (main) main.style.display = 'none';

        firebase.auth().onAuthStateChanged(user => {
            if (!user) {
                window.location.href = getLoginUrl() + '?mode=admin&return=' + encodeURIComponent(window.location.href);
                return;
            }
            getUserData(user.uid).then(data => {
                if (data && data.role === 'admin') {
                    if (main) main.style.display = '';
                } else {
                    window.location.href = getLoginUrl() + '?mode=admin&return=' + encodeURIComponent(window.location.href);
                }
            });
        });
    };

    const _setActiveNavLink = () => {
        const currentFile = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('nav a').forEach(link => {
            const linkFile = (link.getAttribute('href') || '').split('/').pop();
            if (linkFile && linkFile === currentFile) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    };

    const _LS_NAV       = 'rv_nav_cache';
    const _LS_NAV_GUEST = 'rv_nav_guest';

    const _saveNavCache   = (name, role) => { try { localStorage.setItem(_LS_NAV, JSON.stringify({ name, role })); } catch {} };
    const _getNavCache    = () => { try { return JSON.parse(localStorage.getItem(_LS_NAV)); } catch { return null; } };
    const _clearNavCache  = () => { localStorage.removeItem(_LS_NAV); };

    const _saveGuestCache  = () => { localStorage.setItem(_LS_NAV_GUEST, '1'); };
    const _clearGuestCache = () => { localStorage.removeItem(_LS_NAV_GUEST); };
    const _isGuestCached   = () => localStorage.getItem(_LS_NAV_GUEST) === '1';

    // Signed-in customers see "My Orders"; guests see "Track Order" —
    // both lead to orders.html, which shows the right view for each.
    const _injectOrdersLink = (role, label) => {
        const existing = document.getElementById('nav-orders-injected');
        if (existing) existing.remove();
        if (role === 'admin') return;
        const text = label || 'My Orders';
        const icon = text === 'Track Order'
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path><rect x="9" y="3" width="6" height="4" rx="1" ry="1"></rect></svg>';
        const ordersUrl  = window.location.pathname.includes('/pages/') ? 'orders.html' : 'pages/orders.html';
        const cartLink   = document.querySelector('nav ul li a[href*="cart.html"]');
        const li         = document.createElement('li');
        li.id            = 'nav-orders-injected';
        li.innerHTML     = '<a href="' + ordersUrl + '">' + icon + text + '</a>';
        if (cartLink) {
            cartLink.parentElement.parentNode.insertBefore(li, cartLink.parentElement.nextSibling);
        } else {
            const authItem = document.getElementById('nav-auth-item');
            if (authItem) authItem.parentNode.insertBefore(li, authItem);
        }
        setTimeout(_setActiveNavLink, 0);
    };

    const _renderLoggedInNav = (name, role) => {
        const navItem    = document.getElementById('nav-auth-item');
        const logoutItem = document.getElementById('nav-logout-item');
        if (logoutItem) logoutItem.style.display = 'none';
        _injectOrdersLink(role);
        if (!navItem) return;
        const initial    = escapeHtml(name.charAt(0).toUpperCase());
        const badgeClass = role === 'admin' ? 'badge-admin' : 'badge-member';
        const badgeLabel = role === 'admin' ? 'Admin' : 'Member';
        navItem.innerHTML =
            '<div class="nav-user-area">' +
                '<button class="nav-profile-btn" onclick="authModule.toggleProfileMenu(event)" aria-haspopup="true" aria-expanded="false">' +
                    '<span class="nav-profile-avatar">' + initial + '</span>' +
                    '<span class="nav-user-name">' + escapeHtml(name) + '</span>' +
                    '<svg class="nav-profile-chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
                '</button>' +
                '<div class="nav-profile-dropdown" id="nav-profile-dropdown">' +
                    '<div class="profile-dropdown-header">' +
                        '<div class="profile-dropdown-avatar">' + initial + '</div>' +
                        '<div class="profile-dropdown-info">' +
                            '<div class="profile-dropdown-name">' + escapeHtml(name) + '</div>' +
                            '<span class="nav-role-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
                        '</div>' +
                    '</div>' +
                    (role === 'admin' && isAdminPreviewMode()
                        ? '<button class="profile-dropdown-item profile-dd-adminpanel" onclick="authModule.exitPreviewMode()">' +
                              '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>' +
                              'Admin Panel' +
                          '</button>'
                        : '') +
                    '<div class="profile-dropdown-divider"></div>' +
                    '<button class="profile-dropdown-item" onclick="authModule.openChangePassword(); authModule.closeProfileMenu()">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
                        'Change Password' +
                    '</button>' +
                    '<div class="profile-dropdown-divider"></div>' +
                    '<button class="profile-dropdown-item profile-dropdown-signout" onclick="authModule.logout()">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
                        'Sign Out' +
                    '</button>' +
                '</div>' +
                '<div class="nav-user-inline">' +
                    '<button class="nav-user-inline-info" onclick="closeNav(); authModule.openChangePassword();" aria-label="Change password">' +
                        '<span class="nav-profile-avatar">' + initial + '</span>' +
                        '<div class="nav-user-inline-text">' +
                            '<span class="nav-user-inline-name">' + escapeHtml(name) + '</span>' +
                            '<span class="nav-role-badge ' + badgeClass + '">' + badgeLabel + '</span>' +
                        '</div>' +
                        '<svg class="nav-user-inline-chevron" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
                    '</button>' +
                    '<button class="nav-logout-icon-btn" onclick="authModule.logout()" aria-label="Sign out" title="Sign out">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
                    '</button>' +
                '</div>' +
            '</div>';
        if (role === 'admin' && isAdminPreviewMode()) {
            _injectPreviewBar();
        }
    };

    const _renderLoggedOutNav = () => {
        const navItem    = document.getElementById('nav-auth-item');
        const logoutItem = document.getElementById('nav-logout-item');
        if (logoutItem) logoutItem.style.display = 'none';
        _injectOrdersLink(null, 'Track Order');
        if (!navItem) return;
        const isGuest = localStorage.getItem('rv_guest') === 'true';
        navItem.innerHTML = isGuest
            ? '<div class="nav-user-area"><span class="nav-role-badge badge-guest">Guest</span><a href="' + getLoginUrl() + '" class="btn-nav-signin">Sign In</a></div>'
            : '<a href="' + getLoginUrl() + '" class="btn-nav-signin">Sign In</a>';
    };

    const updateNavAuth = () => {
        _setActiveNavLink();

        const cached = _getNavCache();
        if (cached) {
            _renderLoggedInNav(cached.name, cached.role);
        } else if (_isGuestCached()) {
            _renderLoggedOutNav();
        }

        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                _clearGuestCache();
                getUserData(user.uid).then(data => {
                    const name = (data && data.name) ? data.name.split(' ')[0] : user.email;
                    const role = data ? data.role : 'user';
                    _saveNavCache(name, role);
                    _renderLoggedInNav(name, role);
                });
            } else {
                _clearNavCache();
                _saveGuestCache();
                _renderLoggedOutNav();
            }
        });
    };

    const escapeHtml = (str) => {
        const d = document.createElement('div');
        d.appendChild(document.createTextNode(str));
        return d.innerHTML;
    };

    const toggleProfileMenu = (e) => {
        if (e) e.stopPropagation();
        const dropdown = document.getElementById('nav-profile-dropdown');
        const btn = document.querySelector('.nav-profile-btn');
        if (!dropdown) return;
        const isOpen = dropdown.classList.contains('open');
        closeProfileMenu();
        if (!isOpen) {
            dropdown.classList.add('open');
            if (btn) btn.setAttribute('aria-expanded', 'true');
        }
    };

    const closeProfileMenu = () => {
        const dropdown = document.getElementById('nav-profile-dropdown');
        const btn = document.querySelector('.nav-profile-btn');
        if (dropdown) dropdown.classList.remove('open');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    };

    document.addEventListener('click', () => closeProfileMenu());

    const canCheckout = () => {
        return new Promise(resolve => {
            const unsub = firebase.auth().onAuthStateChanged(user => {
                unsub();
                resolve(!!user);
            });
        });
    };

    const redirectIfAdmin = () => {
        if (isAdminPreviewMode()) return; 
        firebase.auth().onAuthStateChanged(user => {
            if (!user) return; 
            getUserData(user.uid).then(data => {
                if (data && data.role === 'admin') {
                    const isInPages = window.location.pathname.includes('/pages/');
                    window.location.href = isInPages ? 'admin.html' : 'pages/admin.html';
                }
            });
        });
    };

    const _PREVIEW_KEY = 'rv_admin_preview';
    const isAdminPreviewMode = () => sessionStorage.getItem(_PREVIEW_KEY) === '1';

    const enterPreviewMode = () => {
        sessionStorage.setItem(_PREVIEW_KEY, '1');
        const isInPages = window.location.pathname.includes('/pages/');
        window.location.href = isInPages ? '../index.html' : 'index.html';
    };

    const exitPreviewMode = () => {
        sessionStorage.removeItem(_PREVIEW_KEY);
        const isInPages = window.location.pathname.includes('/pages/');
        window.location.href = isInPages ? 'admin.html' : 'pages/admin.html';
    };

    const _injectPreviewBar = () => {
        if (document.getElementById('admin-preview-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'admin-preview-bar';
        bar.innerHTML =
            '<span class="apb-label">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
                ' Admin Preview Mode' +
            '</span>' +
            '<button class="apb-btn" onclick="authModule.exitPreviewMode()">&#8592; Back to Admin Panel</button>';
        document.body.appendChild(bar);
    };

    const eyeOpenSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const eyeClosedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    const checkSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

    const injectChangePasswordModal = () => {
        if (document.getElementById('cp-modal-overlay')) return;

        const html = `
        <div id="cp-modal-overlay" class="cp-modal-overlay">
            <div class="cp-modal">
                <div class="cp-header">
                    <div class="cp-header-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </div>
                    <h3>Change Password</h3>
                    <p>Update your account security</p>
                </div>
                <div class="cp-body">
                    <div id="cp-message" class="cp-message"></div>

                    <form id="cp-form" onsubmit="authModule.handleChangePassword(event)">
                        <div class="cp-form-group">
                            <label for="cp-current-pw">Current Password</label>
                            <div class="cp-input-wrap">
                                <input type="password" id="cp-current-pw" placeholder="Enter current password" required autocomplete="current-password">
                                <button type="button" class="cp-toggle-pw" onclick="authModule.togglePwVisibility('cp-current-pw', this)">${eyeClosedSvg}</button>
                            </div>
                        </div>

                        <div class="cp-form-group">
                            <label for="cp-new-pw">New Password</label>
                            <div class="cp-input-wrap">
                                <input type="password" id="cp-new-pw" placeholder="Min. 6 characters" required autocomplete="new-password" oninput="authModule.validateNewPassword()">
                                <button type="button" class="cp-toggle-pw" onclick="authModule.togglePwVisibility('cp-new-pw', this)">${eyeClosedSvg}</button>
                            </div>
                            <div class="cp-strength-bar"><div id="cp-strength-fill" class="cp-strength-fill"></div></div>
                            <div id="cp-strength-label" class="cp-strength-label"></div>
                            <div class="cp-requirements">
                                <div class="cp-req-item" id="cp-req-length"><span class="cp-req-icon"></span> 6+ characters</div>
                                <div class="cp-req-item" id="cp-req-upper"><span class="cp-req-icon"></span> Uppercase</div>
                                <div class="cp-req-item" id="cp-req-lower"><span class="cp-req-icon"></span> Lowercase</div>
                                <div class="cp-req-item" id="cp-req-number"><span class="cp-req-icon"></span> Number</div>
                            </div>
                        </div>

                        <div class="cp-form-group">
                            <label for="cp-confirm-pw">Confirm New Password</label>
                            <div class="cp-input-wrap">
                                <input type="password" id="cp-confirm-pw" placeholder="Re-enter new password" required autocomplete="new-password" oninput="authModule.validateConfirmPassword()">
                                <button type="button" class="cp-toggle-pw" onclick="authModule.togglePwVisibility('cp-confirm-pw', this)">${eyeClosedSvg}</button>
                            </div>
                            <div id="cp-confirm-hint" class="cp-hint"></div>
                        </div>

                        <div class="cp-actions">
                            <button type="button" class="cp-btn cp-btn-secondary" onclick="authModule.closeChangePassword()">Cancel</button>
                            <button type="submit" class="cp-btn cp-btn-primary" id="cp-submit-btn">Update Password</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('cp-modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'cp-modal-overlay') closeChangePassword();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeChangePassword();
        });
    };

    const openChangePassword = () => {
        injectChangePasswordModal();
        const form = document.getElementById('cp-form');
        if (form) form.reset();
        const msg = document.getElementById('cp-message');
        if (msg) { msg.className = 'cp-message'; msg.textContent = ''; }
        const fill = document.getElementById('cp-strength-fill');
        if (fill) fill.className = 'cp-strength-fill';
        const label = document.getElementById('cp-strength-label');
        if (label) { label.className = 'cp-strength-label'; label.textContent = ''; }
        ['cp-req-length', 'cp-req-upper', 'cp-req-lower', 'cp-req-number'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.classList.remove('met'); el.querySelector('.cp-req-icon').innerHTML = ''; }
        });
        const hint = document.getElementById('cp-confirm-hint');
        if (hint) { hint.className = 'cp-hint'; hint.textContent = ''; }
        ['cp-current-pw', 'cp-new-pw', 'cp-confirm-pw'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.className = '';
        });
        const btn = document.getElementById('cp-submit-btn');
        if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }

        setTimeout(() => {
            document.getElementById('cp-modal-overlay').classList.add('active');
            document.getElementById('cp-current-pw').focus();
        }, 10);
    };

    const closeChangePassword = () => {
        const overlay = document.getElementById('cp-modal-overlay');
        if (overlay) overlay.classList.remove('active');
    };

    const togglePwVisibility = (inputId, btn) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = eyeOpenSvg;
        } else {
            input.type = 'password';
            btn.innerHTML = eyeClosedSvg;
        }
    };

    const getPasswordStrength = (pw) => {
        let score = 0;
        if (pw.length >= 6) score++;
        if (pw.length >= 10) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[a-z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        if (score <= 2) return 'weak';
        if (score <= 4) return 'medium';
        return 'strong';
    };

    const validateNewPassword = () => {
        const pw = document.getElementById('cp-new-pw').value;
        const fill = document.getElementById('cp-strength-fill');
        const label = document.getElementById('cp-strength-label');

        if (pw.length === 0) {
            fill.className = 'cp-strength-fill';
            label.className = 'cp-strength-label';
            label.textContent = '';
        } else {
            const strength = getPasswordStrength(pw);
            fill.className = 'cp-strength-fill ' + strength;
            label.className = 'cp-strength-label ' + strength;
            const labels = { weak: 'Weak password', medium: 'Good password', strong: 'Strong password' };
            label.textContent = labels[strength];
        }

        const checks = {
            'cp-req-length': pw.length >= 6,
            'cp-req-upper': /[A-Z]/.test(pw),
            'cp-req-lower': /[a-z]/.test(pw),
            'cp-req-number': /[0-9]/.test(pw)
        };
        Object.keys(checks).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const icon = el.querySelector('.cp-req-icon');
            if (checks[id]) {
                el.classList.add('met');
                icon.innerHTML = checkSvg;
            } else {
                el.classList.remove('met');
                icon.innerHTML = '';
            }
        });

        if (document.getElementById('cp-confirm-pw').value) {
            validateConfirmPassword();
        }
    };

    const validateConfirmPassword = () => {
        const newPw = document.getElementById('cp-new-pw').value;
        const confirmPw = document.getElementById('cp-confirm-pw').value;
        const hint = document.getElementById('cp-confirm-hint');
        const input = document.getElementById('cp-confirm-pw');

        if (!confirmPw) {
            hint.className = 'cp-hint';
            hint.textContent = '';
            input.className = '';
            return;
        }

        if (newPw === confirmPw) {
            hint.className = 'cp-hint success';
            hint.textContent = '✓ Passwords match';
            input.className = 'input-success';
        } else {
            hint.className = 'cp-hint error';
            hint.textContent = 'Passwords do not match';
            input.className = 'input-error';
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();

        const currentPw = document.getElementById('cp-current-pw').value;
        const newPw = document.getElementById('cp-new-pw').value;
        const confirmPw = document.getElementById('cp-confirm-pw').value;
        const btn = document.getElementById('cp-submit-btn');
        const msg = document.getElementById('cp-message');

        msg.className = 'cp-message';
        msg.textContent = '';

        if (newPw.length < 6) {
            msg.className = 'cp-message error';
            msg.textContent = 'New password must be at least 6 characters long.';
            document.getElementById('cp-new-pw').focus();
            return;
        }

        if (!/[A-Z]/.test(newPw)) {
            msg.className = 'cp-message error';
            msg.textContent = 'New password must contain at least one uppercase letter.';
            document.getElementById('cp-new-pw').focus();
            return;
        }

        if (!/[a-z]/.test(newPw)) {
            msg.className = 'cp-message error';
            msg.textContent = 'New password must contain at least one lowercase letter.';
            document.getElementById('cp-new-pw').focus();
            return;
        }

        if (!/[0-9]/.test(newPw)) {
            msg.className = 'cp-message error';
            msg.textContent = 'New password must contain at least one number.';
            document.getElementById('cp-new-pw').focus();
            return;
        }

        if (newPw !== confirmPw) {
            msg.className = 'cp-message error';
            msg.textContent = 'New password and confirmation do not match.';
            document.getElementById('cp-confirm-pw').focus();
            return;
        }

        if (currentPw === newPw) {
            msg.className = 'cp-message error';
            msg.textContent = 'New password must be different from your current password.';
            document.getElementById('cp-new-pw').focus();
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Updating...';

        try {
            const user = firebase.auth().currentUser;
            if (!user || !user.email) {
                throw { code: 'auth/no-user' };
            }

            const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw);
            await user.reauthenticateWithCredential(credential);

            await user.updatePassword(newPw);

            msg.className = 'cp-message success';
            msg.textContent = '✓ Password updated successfully!';
            btn.textContent = 'Done!';

            setTimeout(() => {
                closeChangePassword();
            }, 1800);

        } catch (err) {
            const errorMap = {
                'auth/wrong-password':      'Current password is incorrect.',
                'auth/invalid-credential':   'Current password is incorrect.',
                'auth/too-many-requests':    'Too many attempts. Please try again later.',
                'auth/requires-recent-login': 'Session expired. Please sign out and sign in again.',
                'auth/weak-password':        'New password is too weak. Please use a stronger password.',
                'auth/no-user':              'You must be signed in to change your password.'
            };
            msg.className = 'cp-message error';
            msg.textContent = errorMap[err.code] || 'Failed to update password. Please try again.';
            btn.disabled = false;
            btn.textContent = 'Update Password';
        }
    };

    const _LS_LAST_ACTIVE = 'rv_last_active';
    const _MAX_AWAY_MS    = 8 * 60 * 60 * 1000; 

    const _touchLastActive = () => {
        try { localStorage.setItem(_LS_LAST_ACTIVE, Date.now().toString()); } catch {}
    };

    const _clearLastActive = () => {
        try { localStorage.removeItem(_LS_LAST_ACTIVE); } catch {}
    };

    const _checkLastActive = (user) => {
        if (!user) return;
        try {
            const last = parseInt(localStorage.getItem(_LS_LAST_ACTIVE) || '0', 10);
            if (last && (Date.now() - last) > _MAX_AWAY_MS) {
                _clearLastActive();
                firebase.auth().signOut();
                return;
            }
        } catch {}
        _touchLastActive();
    };

    const SESSION_TIMEOUT = 1800; 
    const SESSION_WARN    = 60;  

    let _sessionTimer   = null;
    let _warnTimer      = null;
    let _countdownTimer = null;
    let _timerActive    = false;

    const _clearAllTimers = () => {
        clearTimeout(_sessionTimer);
        clearTimeout(_warnTimer);
        clearInterval(_countdownTimer);
    };

    const _hideWarning = () => {
        const el = document.getElementById('session-warn-modal');
        if (el) el.style.display = 'none';
    };

    const _showWarning = (secondsLeft) => {
        let overlay = document.getElementById('session-warn-modal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'session-warn-modal';
            overlay.innerHTML = `
                <div class="session-warn-box">
                    <div class="session-warn-icon">⏱</div>
                    <h3 class="session-warn-title">Still there?</h3>
                    <p class="session-warn-msg">You'll be logged out in <strong id="session-countdown">${secondsLeft}</strong> second(s) due to inactivity.</p>
                    <button class="button session-warn-btn" onclick="authModule.resetSessionTimer()">Stay Logged In</button>
                </div>`;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
        const el = document.getElementById('session-countdown');
        if (el) el.textContent = secondsLeft;
    };

    const resetSessionTimer = () => {
        if (!_timerActive) return;
        _clearAllTimers();
        _hideWarning();
        _touchLastActive(); 

        _warnTimer = setTimeout(() => {
            let left = SESSION_WARN;
            _showWarning(left);
            _countdownTimer = setInterval(() => {
                left--;
                const el = document.getElementById('session-countdown');
                if (el) el.textContent = left;
                if (left <= 0) {
                    clearInterval(_countdownTimer);
                    _timerActive = false;
                    logout();
                }
            }, 1000);
        }, (SESSION_TIMEOUT - SESSION_WARN) * 1000);
    };

    const _EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const startSessionTimer = () => {
        if (_timerActive) return;
        _timerActive = true;
        _EVENTS.forEach(ev => window.addEventListener(ev, resetSessionTimer, { passive: true }));

        if (!document.getElementById('session-warn-style')) {
            const style = document.createElement('style');
            style.id = 'session-warn-style';
            style.textContent = `
                #session-warn-modal {
                    position: fixed; inset: 0; z-index: 9999;
                    background: rgba(26,42,27,0.55);
                    backdrop-filter: blur(4px);
                    display: none; align-items: center; justify-content: center;
                }
                .session-warn-box {
                    background: #fff; border-radius: 20px; padding: 36px 32px;
                    max-width: 360px; width: 90%; text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                    animation: slideUp 0.3s ease;
                }
                .session-warn-icon { font-size: 2.4em; margin-bottom: 10px; }
                .session-warn-title { font-family: 'Playfair Display', serif; color: #2c3e2d; margin-bottom: 8px; font-size: 1.3em; }
                .session-warn-msg { color: #666; font-size: 0.93em; line-height: 1.6; margin-bottom: 22px; }
                .session-warn-btn { width: auto !important; padding: 11px 28px !important; }
            `;
            document.head.appendChild(style);
        }

        resetSessionTimer();
    };

    const stopSessionTimer = () => {
        _timerActive = false;
        _clearAllTimers();
        _hideWarning();
        _EVENTS.forEach(ev => window.removeEventListener(ev, resetSessionTimer));
    };

    firebase.auth().onAuthStateChanged(user => {
        if (user && !user.isAnonymous) {
            _checkLastActive(user); 
            startSessionTimer();
        } else {
            stopSessionTimer();
        }
    });

    return {
        register,
        login,
        logout,
        continueAsGuest,
        getCurrentUser,
        getUserData,
        onAuthChange,
        requireAdmin,
        updateNavAuth,
        redirectIfAdmin,
        canCheckout,
        getLoginUrl,
        isAdminPreviewMode,
        enterPreviewMode,
        exitPreviewMode,
        openChangePassword,
        closeChangePassword,
        handleChangePassword,
        togglePwVisibility,
        validateNewPassword,
        validateConfirmPassword,
        toggleProfileMenu,
        closeProfileMenu,
        resetSessionTimer,
        startSessionTimer,
        stopSessionTimer,
    };
})();

