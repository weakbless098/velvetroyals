const authModule = (() => {
    const getDb = () => (typeof db !== 'undefined' ? db : null);

    // Pages live at root-level addresses (/login, /admin…) — see firebase.json.
    const getLoginUrl = () => '/login';

    // The link in the email brings the customer back to the sign-in page.
    const sendVerification = (user) => user.sendEmailVerification({ url: window.location.origin + '/login' });

    const register = (name, email, password) => {
        return firebase.auth()
            .createUserWithEmailAndPassword(email, password)
            .then(result => {
                return firebase.database().ref('users/' + result.user.uid).set({
                    name:      name.trim(),
                    email:     email.trim(),
                    role:      'user',
                    createdAt: new Date().toISOString()
                })
                    .then(() => result.user.updateProfile({ displayName: name.trim() }).catch(() => {}))
                    // Best effort: a mail hiccup must not fail the sign-up.
                    .then(() => sendVerification(result.user).catch(e => console.warn('Verification email not sent:', e)))
                    .then(() => ({ user: result.user, role: 'user' }));
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
        window.location.href = '/';
    };

    const getCurrentUser = () => firebase.auth().currentUser;

    const getUserData = (uid) => {
        const database = getDb();
        if (!database) return Promise.resolve(null);
        return database.ref('users/' + uid).once('value').then(snap => snap.val());
    };

    const onAuthChange = (callback) => firebase.auth().onAuthStateChanged(callback);

    // Storage rules can't read the database, so the server copies the admin
    // role onto the sign-in token (an `admin` claim). Uploading or deleting
    // product photos needs it; photo uploads wait for this to finish.
    let _adminClaim = null;
    const _syncAdminClaim = (user) => {
        if (!_adminClaim) {
            _adminClaim = (async () => {
                try {
                    if (!firebase.functions) return;
                    const res = await firebase.functions().httpsCallable('syncAdminClaim')();
                    const token = await user.getIdTokenResult();
                    if (res.data && res.data.admin && token.claims.admin !== true) await user.getIdToken(true);
                } catch (e) {
                    console.warn('Could not refresh photo permissions:', e);
                }
            })();
        }
        return _adminClaim;
    };
    const adminClaimReady = () => _adminClaim || Promise.resolve();

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
                    _syncAdminClaim(user);
                    _setIdleLimit(ADMIN_IDLE_LIMIT);
                } else {
                    window.location.href = getLoginUrl() + '?mode=admin&return=' + encodeURIComponent(window.location.href);
                }
            });
        });
    };

    // Same as pageName() in utils.js — kept here because login.html loads
    // this file without utils.js. "/pages/cart", "cart.html" → "cart".
    const _pageName = (p) => (String(p || '').split(/[?#]/)[0].split('/').pop() || 'index').replace(/\.html$/, '');

    const _setActiveNavLink = () => {
        const currentFile = _pageName(window.location.pathname);
        document.querySelectorAll('nav a').forEach(link => {
            const href = link.getAttribute('href') || '';
            if (href && !href.startsWith('#') && _pageName(href) === currentFile) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    };

    const _LS_NAV       = 'rv_nav_cache';
    const _LS_NAV_GUEST = 'rv_nav_guest';

    const _saveNavCache   = (name, role, photo) => { try { localStorage.setItem(_LS_NAV, JSON.stringify({ name, role, photo: photo || '' })); } catch {} };
    const _getNavCache    = () => { try { return JSON.parse(localStorage.getItem(_LS_NAV)); } catch { return null; } };
    const _clearNavCache  = () => { localStorage.removeItem(_LS_NAV); };

    const _saveGuestCache  = () => { localStorage.setItem(_LS_NAV_GUEST, '1'); };
    const _clearGuestCache = () => { localStorage.removeItem(_LS_NAV_GUEST); };
    const _isGuestCached   = () => localStorage.getItem(_LS_NAV_GUEST) === '1';

    // Signed-in customers see "My Orders"; guests see "Track Order" —
    // both lead to orders, which shows the right view for each.
    const _injectOrdersLink = (role, label) => {
        const existing = document.getElementById('nav-orders-injected');
        if (existing) existing.remove();
        if (role === 'admin') return;
        const text = label || 'My Orders';
        const icon = text === 'Track Order'
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path><rect x="9" y="3" width="6" height="4" rx="1" ry="1"></rect></svg>';
        const ordersUrl  = '/orders';
        const cartLink   = document.querySelector('nav ul li a[href*="cart"]');
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

    const _renderLoggedInNav = (name, role, photo) => {
        const navItem    = document.getElementById('nav-auth-item');
        const logoutItem = document.getElementById('nav-logout-item');
        if (logoutItem) logoutItem.style.display = 'none';
        _injectOrdersLink(role);
        if (!navItem) return;
        const badgeClass = role === 'admin' ? 'badge-admin' : 'badge-member';
        const badgeLabel = role === 'admin' ? 'Admin' : 'Member';
        navItem.innerHTML =
            '<div class="nav-user-area">' +
                '<button class="nav-profile-btn" onclick="authModule.toggleProfileMenu(event)" aria-haspopup="true" aria-expanded="false">' +
                    _avatarHtml('nav-profile-avatar', name, photo) +
                    '<span class="nav-user-name">' + escapeHtml(name) + '</span>' +
                    '<svg class="nav-profile-chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
                '</button>' +
                '<div class="nav-profile-dropdown" id="nav-profile-dropdown">' +
                    '<div class="profile-dropdown-header">' +
                        _avatarHtml('profile-dropdown-avatar', name, photo, 'div') +
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
                    '<button class="profile-dropdown-item" onclick="authModule.openProfile(); authModule.closeProfileMenu()">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
                        'My Profile' +
                    '</button>' +
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
                    '<button class="nav-user-inline-info" onclick="closeNav(); authModule.openProfile();" aria-label="My profile">' +
                        _avatarHtml('nav-profile-avatar', name, photo) +
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

    const _VERIFY_DISMISSED = 'rv_verify_dismissed';

    const _showVerifyBar = (user) => {
        if (document.getElementById('verify-email-bar')) return;
        try { if (sessionStorage.getItem(_VERIFY_DISMISSED) === '1') return; } catch {}
        const bar = document.createElement('div');
        bar.id = 'verify-email-bar';
        bar.className = 'verify-email-bar';
        bar.innerHTML =
            '<span class="verify-email-text">Please confirm your email address. We sent a link to <strong>' + escapeHtml(user.email || '') + '</strong>.</span>' +
            '<button type="button" class="verify-email-resend">Resend link</button>' +
            '<button type="button" class="verify-email-close" aria-label="Dismiss">&times;</button>';
        document.body.prepend(bar);
        const resend = bar.querySelector('.verify-email-resend');
        resend.addEventListener('click', () => {
            resend.disabled = true;
            resend.textContent = 'Sending...';
            sendVerification(user)
                .then(() => { resend.textContent = 'Sent! Check your inbox'; })
                .catch(e => {
                    resend.textContent = e && e.code === 'auth/too-many-requests' ? 'Please wait a few minutes' : 'Couldn’t send. Try later';
                    setTimeout(() => { resend.disabled = false; resend.textContent = 'Resend link'; }, 60000);
                });
        });
        bar.querySelector('.verify-email-close').addEventListener('click', () => {
            try { sessionStorage.setItem(_VERIFY_DISMISSED, '1'); } catch {}
            bar.remove();
        });
    };

    // Refreshes the account first so a link confirmed in
    // another tab or on the phone is noticed.
    const _checkEmailVerified = (user, role) => {
        if (!user || user.emailVerified || !user.email) return;
        user.reload()
            .then(() => { const u = firebase.auth().currentUser; if (u && !u.emailVerified) _showVerifyBar(u); })
            .catch(() => {});
    };

    const updateNavAuth = () => {
        _setActiveNavLink();

        const cached = _getNavCache();
        if (cached) {
            _renderLoggedInNav(cached.name, cached.role, cached.photo);
        } else if (_isGuestCached()) {
            _renderLoggedOutNav();
        }

        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                _clearGuestCache();
                getUserData(user.uid).then(data => {
                    const name = (data && data.name) ? data.name.split(' ')[0] : user.email;
                    const role = data ? data.role : 'user';
                    const photo = _safePhoto(data && data.photoURL);
                    _saveNavCache(name, role, photo);
                    _renderLoggedInNav(name, role, photo);
                    _checkEmailVerified(user, role);
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
                    window.location.href = '/admin';
                }
            });
        });
    };

    const _PREVIEW_KEY = 'rv_admin_preview';
    const isAdminPreviewMode = () => sessionStorage.getItem(_PREVIEW_KEY) === '1';

    const enterPreviewMode = () => {
        sessionStorage.setItem(_PREVIEW_KEY, '1');
        window.location.href = '/';
    };

    const exitPreviewMode = () => {
        sessionStorage.removeItem(_PREVIEW_KEY);
        window.location.href = '/admin';
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
                                <input type="password" id="cp-new-pw" placeholder="Min. 8 characters" required autocomplete="new-password" oninput="authModule.validateNewPassword()">
                                <button type="button" class="cp-toggle-pw" onclick="authModule.togglePwVisibility('cp-new-pw', this)">${eyeClosedSvg}</button>
                            </div>
                            <div class="cp-strength-bar"><div id="cp-strength-fill" class="cp-strength-fill"></div></div>
                            <div id="cp-strength-label" class="cp-strength-label"></div>
                            <div class="cp-requirements">
                                <div class="cp-req-item" id="cp-req-length"><span class="cp-req-icon"></span> 8+ characters</div>
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
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
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
            'cp-req-length': pw.length >= 8,
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

        if (newPw.length < 8) {
            msg.className = 'cp-message error';
            msg.textContent = 'New password must be at least 8 characters long.';
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

    const SESSION_TIMEOUT = 1800;          // customers: 30 minutes idle
    const ADMIN_IDLE_LIMIT = 900;          // admins: 15 minutes idle
    let _idleLimit = SESSION_TIMEOUT;
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
        }, (_idleLimit - SESSION_WARN) * 1000);
    };

    const _EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const _setIdleLimit = (seconds) => {
        _idleLimit = seconds;
        if (_timerActive) resetSessionTimer();
    };

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

    // ===== Profile: photo, name, phone and security =====
    // Opened from the account menu. The photo is cropped to a 256px square
    // and re-encoded in the browser, which also strips hidden data such as
    // the GPS location phones store in pictures.
    const _SDK = 'https://www.gstatic.com/firebasejs/9.23.0/';
    const _scripts = {};
    const _loadScript = (src) => _scripts[src] || (_scripts[src] = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.onload = resolve;
        el.onerror = () => { delete _scripts[src]; reject(new Error('Could not load ' + src)); };
        document.head.appendChild(el);
    }));
    const _ensureStorage = async () => { if (!firebase.storage) await _loadScript(_SDK + 'firebase-storage-compat.js'); return firebase.storage(); };
    const _ensureFunctions = async () => { if (!firebase.functions) await _loadScript(_SDK + 'firebase-functions-compat.js'); return firebase.functions(); };

    // Only photos uploaded through the profile window are shown.
    const _PHOTO_RE = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/flowershop-d26f4\.firebasestorage\.app\/o\/avatars%2F[A-Za-z0-9]+%2F[A-Za-z0-9_.-]+\?alt=media&token=[A-Za-z0-9-]+$/;
    const _safePhoto = (url) => (typeof url === 'string' && _PHOTO_RE.test(url)) ? url : '';
    const _avatarPath = (url, uid) => {
        const m = _safePhoto(url).match(/\/o\/avatars%2F([A-Za-z0-9]+)%2F([A-Za-z0-9_.-]+)\?/);
        return m && m[1] === uid ? 'avatars/' + m[1] + '/' + m[2] : null;
    };
    const _avatarHtml = (cls, name, photo, tag = 'span') => {
        const url = _safePhoto(photo);
        const initial = escapeHtml(String(name || '?').charAt(0).toUpperCase());
        return '<' + tag + ' class="' + cls + (url ? ' has-photo' : '') + '">' +
            (url ? '<img src="' + url + '" alt="" loading="lazy" decoding="async">' : initial) +
            '</' + tag + '>';
    };

    const _cropToSquare = (file, size = 256) => new Promise((resolve, reject) => {
        const src = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
            URL.revokeObjectURL(src);
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not read this photo.')), 'image/jpeg', 0.85);
        };
        img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('This file isn’t a photo we can read.')); };
        img.src = src;
    });

    const _userSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
    let _pf = null;            // { uid, name, photo, pendingBlob, preview, removePhoto }

    const _pfMsg = (text, type) => {
        const el = document.getElementById('pf-message');
        if (!el) return;
        el.className = 'cp-message' + (type ? ' ' + type : '');
        el.textContent = text;
    };

    const _renderPfAvatar = () => {
        const box = document.getElementById('pf-avatar');
        if (!box || !_pf) return;
        const shown = _pf.preview || (_pf.removePhoto ? '' : _pf.photo);
        const initial = escapeHtml(String(document.getElementById('pf-name').value || _pf.name || '?').charAt(0).toUpperCase());
        box.innerHTML = shown ? '<img src="' + shown + '" alt="Your profile photo">' : initial;
        box.classList.toggle('has-photo', !!shown);
        document.getElementById('pf-remove').hidden = !shown;
    };

    const _renderEmailStatus = (user) => {
        const box = document.getElementById('pf-email-status');
        if (!box) return;
        if (user.emailVerified) {
            box.innerHTML = '<span class="pf-chip pf-chip-ok">Confirmed</span>';
            return;
        }
        box.innerHTML = '<span class="pf-chip pf-chip-warn">Not confirmed</span> <button type="button" class="pf-link-btn" id="pf-resend">Resend link</button>';
        document.getElementById('pf-resend').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Sending...';
            sendVerification(user)
                .then(() => { btn.textContent = 'Sent! Check your inbox'; })
                .catch(err => { btn.textContent = err && err.code === 'auth/too-many-requests' ? 'Please wait a few minutes' : 'Couldn’t send'; });
        });
    };

    const _device = (ua) => {
        const s = String(ua || '');
        const browser = /Edg\//.test(s) ? 'Edge' : /SamsungBrowser/.test(s) ? 'Samsung Internet' : /Chrome\//.test(s) ? 'Chrome'
            : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'Browser';
        const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows'
            : /Mac OS X/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : 'unknown device';
        return browser + ' on ' + os;
    };

    // Admins see the last sign-ins to the admin area, recorded by the server.
    const _loadAdminLogins = async () => {
        const box = document.getElementById('pf-admin-logins');
        if (!box) return;
        try {
            const snap = await firebase.database().ref('adminLogins').orderByChild('at').limitToLast(8).once('value');
            const rows = [];
            snap.forEach(c => { rows.push(c.val()); });
            if (!rows.length) return;
            rows.reverse();
            box.innerHTML = '<h4>Recent admin sign-ins</h4><ul>' + rows.map(r =>
                '<li><strong>' + escapeHtml(r.email || '') + '</strong><span>' +
                    escapeHtml(new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })) + ' · ' +
                    escapeHtml(_device(r.userAgent)) + (r.ip ? ' · ' + escapeHtml(r.ip) : '') +
                '</span></li>').join('') + '</ul>' +
                '<p class="pf-security-hint">Don’t recognise one? Change your password, then use “Sign out of all devices”.</p>';
            box.hidden = false;
        } catch (e) { /* the list is optional */ }
    };

    const _pickPhoto = async (file) => {
        if (!file || !_pf) return;
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { _pfMsg('Please choose a JPG, PNG or WebP photo.', 'error'); return; }
        if (file.size > 15 * 1024 * 1024) { _pfMsg('That photo is too large. Please choose one under 15 MB.', 'error'); return; }
        try {
            _pfMsg('', '');
            const blob = await _cropToSquare(file);
            if (_pf.preview) URL.revokeObjectURL(_pf.preview);
            _pf.pendingBlob = blob;
            _pf.preview = URL.createObjectURL(blob);
            _pf.removePhoto = false;
            _renderPfAvatar();
        } catch (e) {
            _pfMsg(e.message, 'error');
        }
    };

    const _saveProfile = async (e) => {
        e.preventDefault();
        const user = firebase.auth().currentUser;
        if (!user || !_pf || user.uid !== _pf.uid) return;
        const name = document.getElementById('pf-name').value.trim().replace(/\s+/g, ' ');
        const phone = document.getElementById('pf-phone').value.trim();
        if (!name) { _pfMsg('Please enter your name.', 'error'); return; }
        if (phone && !/^[+0-9 ()-]{6,20}$/.test(phone)) { _pfMsg('Please enter a valid phone number, or leave it empty.', 'error'); return; }

        const btn = document.getElementById('pf-save');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
            const oldPath = _avatarPath(_pf.photo, user.uid);
            let photo = _pf.removePhoto ? '' : _pf.photo;
            if (_pf.pendingBlob) {
                const ref = (await _ensureStorage()).ref('avatars/' + user.uid + '/avatar_' + Date.now() + '.jpg');
                await ref.put(_pf.pendingBlob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' });
                photo = await ref.getDownloadURL();
            }
            await firebase.database().ref('users/' + user.uid).update({
                name,
                phone: phone || null,
                photoURL: photo || null,
                updatedAt: new Date().toISOString()
            });
            await user.updateProfile({ displayName: name, photoURL: photo || null }).catch(() => {});
            // The replaced or removed photo isn't used any more.
            if (oldPath && photo !== _pf.photo) (await _ensureStorage()).ref(oldPath).delete().catch(() => {});

            _pf.photo = photo; _pf.name = name; _pf.pendingBlob = null; _pf.removePhoto = false;
            const first = name.split(' ')[0];
            const role = (_getNavCache() || {}).role || 'user';
            _saveNavCache(first, role, photo);
            _renderLoggedInNav(first, role, photo);
            _pfMsg('✓ Profile saved.', 'success');
            setTimeout(closeProfile, 1200);
        } catch (err) {
            console.error('Profile save failed:', err);
            _pfMsg(err && err.code === 'storage/unauthorized'
                ? 'The photo couldn’t be uploaded. Please try a different JPG, PNG or WebP photo.'
                : 'Couldn’t save your profile. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save';
        }
    };

    // Ends every session on every device, this one included. The server
    // revokes the sign-in tokens and records the time, which the database
    // rules check, so a stolen session stops working straight away.
    const signOutEverywhere = async () => {
        const btn = document.getElementById('pf-signout-all');
        if (btn) { btn.disabled = true; btn.textContent = 'Signing out everywhere...'; }
        try {
            await (await _ensureFunctions()).httpsCallable('signOutEverywhere')();
            _pfMsg('✓ Signed out on every device. Please sign in again.', 'success');
            setTimeout(() => logout(), 1500);
        } catch (e) {
            console.error('Sign out everywhere failed:', e);
            _pfMsg('Couldn’t sign out the other devices. Please try again.', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Sign out of all devices'; }
        }
    };

    const _injectProfileModal = () => {
        if (document.getElementById('pf-modal-overlay')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="pf-modal-overlay" class="cp-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pf-title">
            <div class="cp-modal pf-modal">
                <div class="cp-header">
                    <div class="cp-header-icon">${_userSvg}</div>
                    <h3 id="pf-title">My Profile</h3>
                    <p>Your photo and contact details</p>
                </div>
                <div class="cp-body">
                    <div id="pf-message" class="cp-message"></div>
                    <div class="pf-photo-row">
                        <div id="pf-avatar" class="pf-avatar"></div>
                        <div class="pf-photo-actions">
                            <label class="pf-upload-btn" for="pf-file">Upload photo</label>
                            <input type="file" id="pf-file" accept="image/jpeg,image/png,image/webp" hidden>
                            <button type="button" class="pf-link-btn" id="pf-remove" hidden>Remove photo</button>
                            <small>JPG, PNG or WebP. Cropped to a square; location data is removed.</small>
                        </div>
                    </div>
                    <form id="pf-form" novalidate>
                        <div class="cp-form-group">
                            <label for="pf-name">Full name</label>
                            <input type="text" id="pf-name" maxlength="100" autocomplete="name" required>
                        </div>
                        <div class="cp-form-group">
                            <label for="pf-phone">Phone <span class="pf-optional">(optional)</span></label>
                            <input type="tel" id="pf-phone" maxlength="20" autocomplete="tel" placeholder="+971 50 123 4567">
                        </div>
                        <div class="cp-form-group">
                            <label>Email</label>
                            <div class="pf-email-row"><span id="pf-email"></span><span id="pf-email-status"></span></div>
                        </div>
                        <div class="cp-actions">
                            <button type="button" class="cp-btn cp-btn-secondary" id="pf-cancel">Cancel</button>
                            <button type="submit" class="cp-btn cp-btn-primary" id="pf-save">Save</button>
                        </div>
                    </form>
                    <div class="pf-security">
                        <h4>Security</h4>
                        <div class="pf-security-actions">
                            <button type="button" class="pf-link-btn" id="pf-change-pw">Change password</button>
                            <button type="button" class="pf-link-btn pf-danger" id="pf-signout-all">Sign out of all devices</button>
                        </div>
                        <p class="pf-security-hint">Use “Sign out of all devices” if you signed in on a shared computer or think someone knows your password.</p>
                        <div id="pf-admin-logins" class="pf-admin-logins" hidden></div>
                    </div>
                </div>
            </div>
        </div>`);

        const overlay = document.getElementById('pf-modal-overlay');
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProfile(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProfile(); });
        document.getElementById('pf-file').addEventListener('change', (e) => { _pickPhoto(e.target.files[0]); e.target.value = ''; });
        document.getElementById('pf-remove').addEventListener('click', () => {
            if (_pf.preview) URL.revokeObjectURL(_pf.preview);
            _pf.preview = ''; _pf.pendingBlob = null; _pf.removePhoto = true;
            _renderPfAvatar();
        });
        document.getElementById('pf-name').addEventListener('input', _renderPfAvatar);
        document.getElementById('pf-form').addEventListener('submit', _saveProfile);
        document.getElementById('pf-cancel').addEventListener('click', closeProfile);
        document.getElementById('pf-change-pw').addEventListener('click', () => { closeProfile(); openChangePassword(); });
        // Two clicks, so it can't happen by accident.
        let confirmTimer = null;
        document.getElementById('pf-signout-all').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            if (btn.dataset.confirm === '1') { clearTimeout(confirmTimer); signOutEverywhere(); return; }
            btn.dataset.confirm = '1';
            btn.textContent = 'Click again to sign out everywhere';
            confirmTimer = setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Sign out of all devices'; }, 4000);
        });
    };

    const openProfile = async () => {
        const user = firebase.auth().currentUser;
        if (!user) { window.location.href = getLoginUrl(); return; }
        _injectProfileModal();
        if (_pf && _pf.preview) URL.revokeObjectURL(_pf.preview);
        _pf = { uid: user.uid, name: '', photo: '', pendingBlob: null, preview: '', removePhoto: false };
        _pfMsg('', '');
        document.getElementById('pf-email').textContent = user.email || '';
        _renderEmailStatus(user);
        const signOutAll = document.getElementById('pf-signout-all');
        signOutAll.disabled = false; signOutAll.dataset.confirm = ''; signOutAll.textContent = 'Sign out of all devices';
        document.getElementById('pf-admin-logins').hidden = true;
        document.getElementById('pf-name').value = user.displayName || '';
        document.getElementById('pf-phone').value = '';
        _renderPfAvatar();
        setTimeout(() => document.getElementById('pf-modal-overlay').classList.add('active'), 10);

        let data = null;
        try { data = await getUserData(user.uid); } catch (e) { /* show what we have */ }
        if (!_pf || _pf.uid !== user.uid) return;
        _pf.name = (data && data.name) || user.displayName || '';
        _pf.photo = _safePhoto(data && data.photoURL);
        document.getElementById('pf-name').value = _pf.name;
        document.getElementById('pf-phone').value = (data && data.phone) || '';
        _renderPfAvatar();
        if (data && data.role === 'admin') _loadAdminLogins();
    };

    const closeProfile = () => {
        const overlay = document.getElementById('pf-modal-overlay');
        if (overlay) overlay.classList.remove('active');
        if (_pf && _pf.preview) { URL.revokeObjectURL(_pf.preview); _pf.preview = ''; }
    };

    return {
        register,
        login,
        logout,
        continueAsGuest,
        getCurrentUser,
        getUserData,
        onAuthChange,
        requireAdmin,
        adminClaimReady,
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
        openProfile,
        closeProfile,
        signOutEverywhere,
    };
})();

