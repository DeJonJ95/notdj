<?php
/**
 * ProPortfolio Showcase
 *
 * @package           ProPortfolio_Showcase
 * @author            DeJon Johnson
 * @license           GPL-2.0-or-later
 *
 * @wordpress-plugin
 * Plugin Name:       ProPortfolio Showcase
 * Plugin URI:        https://notdijon.com/
 * Description:       A portfolio project showcase plugin demonstrating custom post types, Gutenberg blocks, shortcodes, widgets, REST API endpoints, and meta field management for WordPress.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            DeJon Johnson
 * Author URI:        https://notdijon.com/
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       proportfolio-showcase
 * Domain Path:       /languages
 */

defined( 'ABSPATH' ) || exit;

/**
 * --------------------------------------------------------------------------
 * Plugin Constants
 * --------------------------------------------------------------------------
 */
define( 'PROPORTFOLIO_VERSION', '1.0.0' );
define( 'PROPORTFOLIO_PATH', plugin_dir_path( __FILE__ ) );
define( 'PROPORTFOLIO_URL', plugin_dir_url( __FILE__ ) );
define( 'PROPORTFOLIO_BASENAME', plugin_basename( __FILE__ ) );
define( 'PROPORTFOLIO_DEBUG', defined( 'WP_DEBUG' ) && WP_DEBUG );

/**
 * --------------------------------------------------------------------------
 * PSR-4-Inspired Autoloader
 * --------------------------------------------------------------------------
 *
 * Maps the ProPortfolio\Includes namespace to the includes/ directory.
 * Class names are expected in the format: class-{name}.php
 * where {name} is the class name in lowercase-with-hyphens form.
 *
 * Example: ProPortfolio\Includes\Post_Types → includes/class-post-types.php
 */
spl_autoload_register( function ( $class ) {
	$prefix   = 'ProPortfolio\\Includes\\';
	$base_dir = PROPORTFOLIO_PATH . 'includes/';

	if ( 0 !== strncmp( $prefix, $class, strlen( $prefix ) ) ) {
		return;
	}

	$relative_class = substr( $class, strlen( $prefix ) );
	$class_parts    = explode( '\\', $relative_class );

	// Convert underscore_case to hyphenated: Post_Types → post-types
	$class_slug = str_replace( '_', '-', strtolower( implode( '-', $class_parts ) ) );
	$file_name  = 'class-' . $class_slug . '.php';
	$file       = $base_dir . $file_name;

	if ( file_exists( $file ) ) {
		require_once $file;
	} else {
		error_log( '[ProPortfolio] Autoloader: file not found for class "' . $class . '" at "' . $file . '"' );
	}
} );

/**
 * --------------------------------------------------------------------------
 * Load Helper Functions
 * --------------------------------------------------------------------------
 */
require_once PROPORTFOLIO_PATH . 'includes/helpers.php';

/**
 * --------------------------------------------------------------------------
 * Activation Hook
 * --------------------------------------------------------------------------
 *
 * Registers the CPT and taxonomies so rewrite rules include them,
 * then flushes. A transient signals the admin to show a setup notice.
 */
register_activation_hook( __FILE__, 'proportfolio_activate' );
function proportfolio_activate() {
	try {
		require_once PROPORTFOLIO_PATH . 'includes/class-post-types.php';
		ProPortfolio\Includes\Post_Types::register_cpt();
		ProPortfolio\Includes\Post_Types::register_taxonomies();

		flush_rewrite_rules();

		set_transient( 'proportfolio_show_setup_wizard', 1, 30 * DAY_IN_SECONDS );
	} catch ( \Throwable $e ) {
		error_log( '[ProPortfolio] Activation error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() );
		wp_die(
			esc_html__( 'ProPortfolio Showcase activation failed: ', 'proportfolio-showcase' )
			. esc_html( $e->getMessage() )
			. '<br><code>' . esc_html( $e->getFile() . ':' . $e->getLine() ) . '</code>'
		);
	}
}

/**
 * --------------------------------------------------------------------------
 * Deactivation Hook
 * --------------------------------------------------------------------------
 */
register_deactivation_hook( __FILE__, 'proportfolio_deactivate' );
function proportfolio_deactivate() {
	flush_rewrite_rules();
}

/**
 * --------------------------------------------------------------------------
 * Bootstrap the Plugin
 * --------------------------------------------------------------------------
 *
 * The main plugin class is a singleton. Calling get_instance() ensures
 * all hooks are registered on the appropriate WordPress actions.
 */
add_action( 'plugins_loaded', 'proportfolio_init' );
function proportfolio_init() {
	try {
		load_plugin_textdomain(
			'proportfolio-showcase',
			false,
			dirname( PROPORTFOLIO_BASENAME ) . '/languages'
		);

		$plugin = ProPortfolio\Includes\Main::get_instance();
		$plugin->init();
	} catch ( \Throwable $e ) {
		error_log( '[ProPortfolio] Init error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() );
	}
}