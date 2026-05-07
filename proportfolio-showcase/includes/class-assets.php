<?php
/**
 * Asset enqueuing (CSS and JavaScript).
 *
 * Conditionally loads styles and scripts for admin, frontend, and block editor.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * Manages all CSS and JavaScript enqueuing.
 */
class Assets {

	/**
	 * Enqueue frontend styles.
	 *
	 * @return void
	 */
	public function enqueue_public_styles() {
		wp_enqueue_style(
			'proportfolio-public',
			PROPORTFOLIO_URL . 'assets/css/public.css',
			array(),
			PROPORTFOLIO_VERSION
		);
	}

	/**
	 * Enqueue frontend scripts (deferred, non-blocking).
	 *
	 * @return void
	 */
	public function enqueue_public_scripts() {
		wp_enqueue_script(
			'proportfolio-public',
			PROPORTFOLIO_URL . 'assets/js/public.js',
			array(),
			PROPORTFOLIO_VERSION,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);

		wp_localize_script(
			'proportfolio-public',
			'proportfolioData',
			array(
				'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				'nonce'   => wp_create_nonce( 'proportfolio_nonce' ),
				'restUrl' => rest_url( 'proportfolio/v1/projects' ),
			)
		);
	}

	/**
	 * Enqueue admin styles.
	 *
	 * @param string $hook_suffix The current admin page hook.
	 * @return void
	 */
	public function enqueue_admin_styles( $hook_suffix ) {
		// Only load on our settings page and the CPT edit screen.
		if ( false === strpos( $hook_suffix, 'portfolio_project' )
			&& 'settings_page_proportfolio' !== $hook_suffix ) {
			return;
		}

		wp_enqueue_style(
			'proportfolio-admin',
			PROPORTFOLIO_URL . 'assets/css/admin.css',
			array(),
			PROPORTFOLIO_VERSION
		);
	}

	/**
	 * Enqueue styles for the block editor.
	 *
	 * @return void
	 */
	public function enqueue_block_editor_styles() {
		wp_enqueue_style(
			'proportfolio-block-editor',
			PROPORTFOLIO_URL . 'assets/css/public.css',
			array(),
			PROPORTFOLIO_VERSION
		);
	}
}