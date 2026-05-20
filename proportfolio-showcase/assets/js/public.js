/**
 * ProPortfolio Showcase — Frontend JavaScript
 *
 * Progressive enhancement: category filtering, lazy-load animations, URL hash sync.
 * Pure ES6+ — no jQuery dependency. Gracefully degrades when JS is unavailable.
 *
 * @package ProPortfolio_Showcase
 */

( function () {
	'use strict';

	/**
	 * Initialize all frontend enhancements once the DOM is ready.
	 */
	function init() {
		initFilterTabs();
		initScrollAnimations();
		restoreFilterFromHash();
	}

	/* ------------------------------------------------------------------ */
	/* Category Filter Tabs
	/* ------------------------------------------------------------------ */

	/**
	 * Wire up click handlers on category filter tab buttons.
	 */
	function initFilterTabs() {
		var wrapper = document.querySelector( '.proportfolio-shortcode-wrapper, .proportfolio-block-wrapper' );

		if ( ! wrapper ) {
			return;
		}

		var tabList = wrapper.querySelector( '.proportfolio-filter-tabs' );

		if ( ! tabList ) {
			return;
		}

		tabList.addEventListener( 'click', function ( event ) {
			var button = event.target.closest( 'button[role="tab"]' );

			if ( ! button ) {
				return;
			}

			var filter = button.getAttribute( 'data-filter' );
			var cards  = wrapper.querySelectorAll( '.proportfolio-card' );

			// Update active tab state.
			tabList.querySelectorAll( 'button[role="tab"]' ).forEach( function ( tab ) {
				tab.classList.remove( 'proportfolio-filter-active' );
				tab.setAttribute( 'aria-selected', 'false' );
			} );

			button.classList.add( 'proportfolio-filter-active' );
			button.setAttribute( 'aria-selected', 'true' );

			// Show/hide cards.
			cards.forEach( function ( card ) {
				var categories = card.getAttribute( 'data-categories' ) || '';

				if ( 'all' === filter || categories.indexOf( filter ) !== -1 ) {
					card.style.display = '';
				} else {
					card.style.display = 'none';
				}
			} );

			// Update URL hash for shareable filter state.
			if ( 'all' === filter ) {
				history.replaceState( null, '', window.location.pathname + window.location.search );
			} else {
				history.replaceState( null, '', '#filter=' + encodeURIComponent( filter ) );
			}
		} );
	}

	/**
	 * Restore the active filter from the URL hash on page load.
	 */
	function restoreFilterFromHash() {
		var hash  = window.location.hash;
		var match = hash.match( /#filter=([^&]+)/ );

		if ( ! match ) {
			return;
		}

		var filter = decodeURIComponent( match[1] );

		if ( ! filter ) {
			return;
		}

		var button = document.querySelector(
			'.proportfolio-filter-tabs button[data-filter="' + CSS.escape( filter ) + '"]'
		);

		if ( button ) {
			button.click();
		}
	}

	/* ------------------------------------------------------------------ */
	/* Scroll-Activated Animations (Intersection Observer)
	/* ------------------------------------------------------------------ */

	/**
	 * Use IntersectionObserver to fade in project cards as they scroll into view.
	 */
	function initScrollAnimations() {
		var cards = document.querySelectorAll( '.proportfolio-card' );

		if ( ! cards.length || ! 'IntersectionObserver' in window ) {
			return;
		}

		// Add initial hidden state via CSS.
		var style = document.createElement( 'style' );
		style.textContent = [
			'.proportfolio-card {',
			'  opacity: 1;',
			'  transform: translateY(0);',
			'  transition: opacity 0.4s ease, transform 0.4s ease;',
			'}',
			'.proportfolio-card.proportfolio-fade-in {',
			'  opacity: 1 !important;',
			'  transform: translateY(0) !important;',
			'}',
		].join( '\n' );
		document.head.appendChild( style );

		// Set initial state.
		cards.forEach( function ( card ) {
			card.style.opacity    = '0';
			card.style.transform  = 'translateY(20px)';
		} );

		var observer = new IntersectionObserver(
			function ( entries ) {
				entries.forEach( function ( entry ) {
					if ( entry.isIntersecting ) {
						entry.target.classList.add( 'proportfolio-fade-in' );
						observer.unobserve( entry.target );
					}
				} );
			},
			{
				rootMargin: '50px 0px',
				threshold:  0.1,
			}
		);

		cards.forEach( function ( card ) {
			observer.observe( card );
		} );
	}

	/* ------------------------------------------------------------------ */
	/* Bootstrap
	/* ------------------------------------------------------------------ */

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();