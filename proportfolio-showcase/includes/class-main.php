<?php
/**
 * Main plugin class for ProPortfolio Showcase.
 *
 * Singleton that wires together all plugin components through WordPress hooks.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * Main plugin class — bootstraps all sub-modules.
 */
class Main {

	/**
	 * Singleton instance.
	 *
	 * @var self|null
	 */
	private static $instance = null;

	/**
	 * Post types handler.
	 *
	 * @var Post_Types|null
	 */
	public $post_types;

	/**
	 * Meta fields handler.
	 *
	 * @var Meta_Fields|null
	 */
	public $meta_fields;

	/**
	 * Blocks handler.
	 *
	 * @var Blocks|null
	 */
	public $blocks;

	/**
	 * Shortcodes handler.
	 *
	 * @var Shortcodes|null
	 */
	public $shortcodes;

	/**
	 * Widget handler.
	 *
	 * @var Widget_Recent_Projects|null
	 */
	public $widget;

	/**
	 * REST API handler.
	 *
	 * @var Rest_Api|null
	 */
	public $rest_api;

	/**
	 * Admin handler.
	 *
	 * @var Admin|null
	 */
	public $admin;

	/**
	 * Demo data handler.
	 *
	 * @var Demo_Data|null
	 */
	public $demo_data;

	/**
	 * Assets handler.
	 *
	 * @var Assets|null
	 */
	public $assets;

	/**
	 * Private constructor — singleton.
	 */
	private function __construct() {
		// Intentionally private.
	}

	/**
	 * Get the singleton instance.
	 *
	 * @return self
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Initialize all plugin modules by hooking them into WordPress.
	 *
	 * @return void
	 */
	public function init() {
		$this->init_assets();
		$this->init_post_types();
		$this->init_meta_fields();
		$this->init_blocks();
		$this->init_shortcodes();
		$this->init_widget();
		$this->init_rest_api();
		$this->init_admin();
		$this->init_demo_data();

		/**
		 * Fires after all ProPortfolio modules are initialized.
		 *
		 * @param self $plugin The main plugin instance.
		 */
		do_action( 'proportfolio_after_init', $this );
	}

	/**
	 * Register asset enqueuing hooks.
	 *
	 * @return void
	 */
	private function init_assets() {
		$this->assets = new Assets();

		add_action( 'wp_enqueue_scripts', array( $this->assets, 'enqueue_public_styles' ) );
		add_action( 'wp_enqueue_scripts', array( $this->assets, 'enqueue_public_scripts' ) );
		add_action( 'admin_enqueue_scripts', array( $this->assets, 'enqueue_admin_styles' ) );
		add_action( 'enqueue_block_editor_assets', array( $this->assets, 'enqueue_block_editor_styles' ) );
	}

	/**
	 * Register post type and taxonomy hooks.
	 *
	 * @return void
	 */
	private function init_post_types() {
		$this->post_types = new Post_Types();

		add_action( 'init', array( $this->post_types, 'register' ) );
		add_filter( 'post_updated_messages', array( $this->post_types, 'updated_messages' ) );
		add_filter( 'bulk_post_updated_messages', array( $this->post_types, 'bulk_updated_messages' ), 10, 2 );
		add_filter( 'single_template', array( $this->post_types, 'single_template' ) );
		add_filter( 'archive_template', array( $this->post_types, 'archive_template' ) );
	}

	/**
	 * Register meta field hooks.
	 *
	 * @return void
	 */
	private function init_meta_fields() {
		$this->meta_fields = new Meta_Fields();

		add_action( 'init', array( $this->meta_fields, 'register_all_fields' ) );
		add_action( 'add_meta_boxes', array( $this->meta_fields, 'add_meta_boxes' ) );
		add_action( 'save_post_portfolio_project', array( $this->meta_fields, 'save_meta_box' ) );
	}

	/**
	 * Register Gutenberg block hooks.
	 *
	 * @return void
	 */
	private function init_blocks() {
		$this->blocks = new Blocks();

		add_action( 'init', array( $this->blocks, 'register_block' ) );
		add_action( 'init', array( $this->blocks, 'register_block_patterns' ) );
		add_action( 'init', array( $this->blocks, 'register_block_pattern_categories' ) );
	}

	/**
	 * Register shortcode hooks.
	 *
	 * @return void
	 */
	private function init_shortcodes() {
		$this->shortcodes = new Shortcodes();

		add_action( 'init', array( $this->shortcodes, 'register' ) );
	}

	/**
	 * Register widget hooks.
	 *
	 * @return void
	 */
	private function init_widget() {
		$this->widget = new Widget_Recent_Projects();

		add_action( 'widgets_init', array( $this->widget, 'register' ) );
	}

	/**
	 * Register REST API hooks.
	 *
	 * @return void
	 */
	private function init_rest_api() {
		$this->rest_api = new Rest_Api();

		add_action( 'rest_api_init', array( $this->rest_api, 'register_routes' ) );
	}

	/**
	 * Register admin hooks.
	 *
	 * @return void
	 */
	private function init_admin() {
		$this->admin = new Admin();

		add_action( 'admin_menu', array( $this->admin, 'add_admin_menu' ) );
		add_action( 'admin_init', array( $this->admin, 'register_settings' ) );
		add_action( 'admin_notices', array( $this->admin, 'admin_notices' ) );
		add_action( 'admin_post_proportfolio_seed_demo', array( $this->admin, 'handle_seed_demo' ) );
		add_action( 'admin_post_proportfolio_remove_demo', array( $this->admin, 'handle_remove_demo' ) );

		// Custom list table columns.
		add_filter( 'manage_portfolio_project_posts_columns', array( $this->admin, 'add_custom_columns' ) );
		add_action( 'manage_portfolio_project_posts_custom_column', array( $this->admin, 'custom_column_content' ), 10, 2 );
		add_filter( 'manage_edit-portfolio_project_sortable_columns', array( $this->admin, 'add_sortable_columns' ) );
	}

	/**
	 * Register demo-data hooks.
	 *
	 * @return void
	 */
	private function init_demo_data() {
		$this->demo_data = new Demo_Data();
	}
}