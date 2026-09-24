const reviewsModule = (() => {
    let reviewsRef = null;
    let currentRating = 0;

    const escHtml = (str) => {
        const d = document.createElement('div');
        d.appendChild(document.createTextNode(String(str || '')));
        return d.innerHTML;
    };

    const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const starsSvg = (rating, size = 16) => {
        let html = '<span class="rv-stars">';
        for (let i = 1; i <= 5; i++) {
            html += `<svg class="rv-star${i <= rating ? ' filled' : ''}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
        }
        return html + '</span>';
    };

    const renderCard = (review) => {
        const initial = escHtml(review.name.charAt(0).toUpperCase());
        return `
        <div class="review-card">
            <div class="review-card-top">
                <div class="review-card-avatar">${initial}</div>
                <div class="review-card-meta">
                    <span class="review-card-name">${escHtml(review.name)}</span>
                    <span class="review-card-date">${fmtDate(review.timestamp)}</span>
                </div>
            </div>
            ${starsSvg(review.rating)}
            <p class="review-card-text">${escHtml(review.text)}</p>
        </div>`;
    };

    const loadReviews = () => {
        const grid = document.getElementById('reviews-grid');
        if (!grid || !reviewsRef) return;

        const section = document.getElementById('reviews-section');
        // Someone arriving from the "scan to review" QR needs the section even
        // when it's still empty — that's the whole point of their visit.
        let wantsToReview = false;
        try {
            wantsToReview = new URLSearchParams(window.location.search).get('review') === '1';
        } catch (e) {}

        reviewsRef.orderByChild('timestamp').limitToLast(12).once('value', snap => {
            const reviews = [];
            snap.forEach(child => reviews.unshift({ id: child.key, ...child.val() }));

            if (reviews.length === 0) {
                // An empty "What Our Clients Say" reads as "nobody has bought
                // here" — worse than not showing it at all. Hide the whole
                // section until there's real social proof to display.
                if (section && !wantsToReview) { section.style.display = 'none'; return; }
                grid.innerHTML = '<div class="reviews-empty">No reviews yet — be the first to share your experience!</div>';
                return;
            }
            if (section) section.style.display = '';
            grid.innerHTML = reviews.map(renderCard).join('');
        });
    };

    const openReviewModal = () => {
        if (document.getElementById('rv-review-overlay')) {
            document.getElementById('rv-review-overlay').classList.add('active');
            return;
        }

        const nameEl = document.querySelector('.nav-user-inline-name');
        const prefill = nameEl ? escHtml(nameEl.textContent.trim()) : '';

        const html = `
        <div id="rv-review-overlay" class="rv-review-overlay" role="dialog" aria-modal="true" aria-labelledby="rv-review-title">
            <div class="rv-review-modal">
                <div class="rv-review-header">
                    <h3 id="rv-review-title">Leave a Review</h3>
                    <button class="rv-review-close" onclick="reviewsModule.closeReviewModal()" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="rv-review-body">
                    <p class="rv-review-subtitle">How was your experience with Velvet Royals Flowershop?</p>
                    <div class="rv-star-picker" id="rv-star-picker" role="radiogroup" aria-label="Rating">
                        ${[1,2,3,4,5].map(i => `
                        <button type="button" class="rv-star-pick-btn" data-value="${i}" aria-label="${i} star${i>1?'s':''}" onclick="reviewsModule.setRating(${i})">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        </button>`).join('')}
                    </div>
                    <p class="rv-rating-label" id="rv-rating-label">Tap a star to rate</p>
                    <div class="form-group">
                        <label for="rv-name-input">Your name</label>
                        <input type="text" id="rv-name-input" placeholder="e.g., Maria" maxlength="60" value="${prefill}" autocomplete="name">
                    </div>
                    <div class="form-group">
                        <label for="rv-text-input">Your review</label>
                        <textarea id="rv-text-input" placeholder="Share your experience with Velvet Royals Flowershop..." rows="4" maxlength="500"></textarea>
                        <span class="rv-char-count" id="rv-char-count">0 / 500</span>
                    </div>
                    <div class="rv-review-error" id="rv-review-error" style="display:none;"></div>
                </div>
                <div class="rv-review-footer">
                    <button type="button" class="button secondary" onclick="reviewsModule.closeReviewModal()">Cancel</button>
                    <button type="button" class="button" id="rv-submit-btn" onclick="reviewsModule.submitReview()">Submit Review</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        currentRating = 0;

        document.getElementById('rv-text-input').addEventListener('input', function () {
            document.getElementById('rv-char-count').textContent = `${this.value.length} / 500`;
        });

        document.getElementById('rv-review-overlay').addEventListener('click', e => {
            if (e.target.id === 'rv-review-overlay') closeReviewModal();
        });

        setTimeout(() => document.getElementById('rv-review-overlay').classList.add('active'), 10);
    };

    const closeReviewModal = () => {
        const overlay = document.getElementById('rv-review-overlay');
        if (!overlay) return;
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    };

    const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'];

    const setRating = (value) => {
        currentRating = value;
        const label = document.getElementById('rv-rating-label');
        if (label) label.textContent = ratingLabels[value] || '';
        document.querySelectorAll('.rv-star-pick-btn').forEach((btn, idx) => {
            btn.classList.toggle('selected', idx < value);
        });
    };

    const submitReview = () => {
        const nameEl  = document.getElementById('rv-name-input');
        const textEl  = document.getElementById('rv-text-input');
        const errorEl = document.getElementById('rv-review-error');
        const btn     = document.getElementById('rv-submit-btn');

        const name = nameEl ? nameEl.value.trim() : '';
        const text = textEl ? textEl.value.trim() : '';

        const showErr = (msg) => { errorEl.textContent = msg; errorEl.style.display = 'block'; };
        const hideErr = ()    => { errorEl.textContent = '';  errorEl.style.display = 'none';  };

        hideErr();
        if (currentRating === 0)       { showErr('Please select a star rating.'); return; }
        if (!name)                     { showErr('Please enter your name.'); nameEl.focus(); return; }
        if (!text || text.length < 10) { showErr('Please write at least 10 characters.'); textEl.focus(); return; }

        btn.disabled = true;
        btn.textContent = 'Submitting…';

        const user = firebase.auth().currentUser;
        reviewsRef.push({
            name,
            rating: currentRating,
            text,
            timestamp: Date.now(),
            uid: user ? user.uid : null,
            isGuest: !user
        }).then(() => {
            closeReviewModal();
            loadReviews();
            showToast('Thank you for your review!');
        }).catch(() => {
            showErr('Could not submit — please try again.');
            btn.disabled = false;
            btn.textContent = 'Submit Review';
        });
    };

    const showToast = (msg) => {
        const t = document.createElement('div');
        t.className = 'rv-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 3200);
    };

    const adminRenderCard = (id, review) => {
        const initial = escHtml(review.name.charAt(0).toUpperCase());
        return `
        <div class="admin-review-card" id="adm-rv-${escHtml(id)}">
            <div class="admin-review-left">
                <div class="admin-review-avatar">${initial}</div>
            </div>
            <div class="admin-review-body">
                <div class="admin-review-top">
                    <span class="admin-review-name">${escHtml(review.name)}</span>
                    ${starsSvg(review.rating, 13)}
                    <span class="admin-review-date">${fmtDate(review.timestamp)}</span>
                    ${review.isGuest ? '<span class="admin-review-badge badge-guest">Guest</span>' : '<span class="admin-review-badge badge-member">Member</span>'}
                </div>
                <p class="admin-review-text">${escHtml(review.text)}</p>
            </div>
            <button class="admin-review-delete" onclick="reviewsModule.deleteReview('${escHtml(id)}')" aria-label="Delete review" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
        </div>`;
    };

    const initAdmin = () => {
        const list  = document.getElementById('admin-reviews-list');
        const badge = document.getElementById('reviews-badge');
        const countLabel = document.getElementById('reviews-count-label');
        if (!list || !reviewsRef) return;

        reviewsRef.orderByChild('timestamp').on('value', snap => {
            const reviews = [];
            snap.forEach(child => reviews.unshift({ id: child.key, ...child.val() }));

            const count = reviews.length;
            if (badge)      { badge.textContent = count; badge.style.display = count > 0 ? 'inline-flex' : 'none'; }
            if (countLabel) { countLabel.textContent = count > 0 ? `(${count})` : ''; countLabel.style.display = count > 0 ? '' : 'none'; }

            if (count === 0) {
                list.innerHTML = '<div class="empty-state">No reviews yet.</div>';
                return;
            }
            list.innerHTML = reviews.map(r => adminRenderCard(r.id, r)).join('');
        });
    };

    const deleteReview = (id) => {
        if (!confirm('Delete this review? This cannot be undone.')) return;
        reviewsRef.child(id).remove().catch(() => alert('Failed to delete review.'));
    };

    const init = () => {
        reviewsRef = firebase.database().ref('reviews');
        loadReviews();

        // Deep link for the "Scan to review" QR code: velvetroyals.com/?review=1
        // scrolls to the reviews section and opens the review form right away.
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('review') === '1') {
                setTimeout(() => {
                    const section = document.getElementById('reviews-section') ||
                        document.querySelector('.editorial-reviews');
                    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setTimeout(openReviewModal, 600);
                }, 400);
            }
        } catch (e) { /* no-op */ }
    };

    return { init, initAdmin, openReviewModal, closeReviewModal, setRating, submitReview, deleteReview };
})();
