<?php
/**
 * Gutenberg Block registration.
 *
 * Registers the "Portfolio Grid" block using the simplest possible approach.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * Handles Gutenberg block registration and block patterns.
 */
class Blocks {

	/**
	 * Register the Portfolio Grid block.
	 *
	 * Uses register_block_type() with explicit args and a render callback.
	 * No block.json dependency — works even if filesystem paths are wonky.
	 *
	 * @return void
	 */
	public function register_block() {
		$registered = register_block_type( 'proportfolio/portfolio-grid', array(
			'api_version'     => 3,
			'editor_script_handles'    => array(),
			'editor_style_handles'     => array( 'proportfolio-block-editor' ),
			'render_callback' => 'proportfolio_render_block',
			'category'        => 'widgets',
			'icon'            => 'portfolio',
			'title'           => __( 'Portfolio Grid', 'proportfolio-showcase' ),
			'description'     => __( 'Display a responsive grid of portfolio projects.', 'proportfolio-showcase' ),
			'keywords'        => array( 'portfolio', 'projects', 'grid', 'gallery', 'showcase' ),
			'attributes'      => array(
				'count'        => array( 'type' => 'number', 'default' => 6 ),
				'columns'      => array( 'type' => 'number', 'default' => 3 ),
				'category'     => array( 'type' => 'string', 'default' => '' ),
				'showFilter'   => array( 'type' => 'boolean', 'default' => true ),
				'orderby'      => array( 'type' => 'string', 'default' => 'date' ),
				'order'        => array( 'type' => 'string', 'default' => 'DESC' ),
				'featuredOnly' => array( 'type' => 'boolean', 'default' => false ),
			),
			'supports'        => array(
				'align'       => array( 'wide', 'full' ),
				'html'        => false,
				'color'       => array( 'background' => true, 'text' => true ),
				'spacing'     => array( 'padding' => true, 'margin' => true ),
				'typography'  => array( 'fontSize' => true, 'lineHeight' => true ),
			),
		) );

		if ( ! $registered ) {
			error_log( '[ProPortfolio] Block registration FAILED for proportfolio/portfolio-grid' );
		} else {
			error_log( '[ProPortfolio] Block registered successfully' );
		}
	}
}

/**
 * Standalone render callback (global namespace, no autoloader dependency).
 *
 * @param array $attributes Block attributes.
 * @return string
 */
function proportfolio_render_block( $attributes ) {
	$atts = shortcode_atts( array(
		'count'        => 6,
		'columns'      => 3,
		'category'     => '',
		'show_filter'  => true,
		'orderby'      => 'date',
		'order'        => 'DESC',
		'featured_only' => false,
	), $attributes );

	return \ProPortfolio\Includes\Shortcodes::render_grid_static( $atts, 'block' );
}

	/**
	 * Register block patterns.
	 *
	 * @return void
	 */
	public function register_block_patterns() {
		if ( ! function_exists( 'register_block_pattern' ) ) {
			return;
		}

		register_block_pattern(
			'proportfolio/portfolio-grid',
			array(
				'title'       => __( 'Portfolio Grid', 'proportfolio-showcase' ),
				'description' => __( 'A responsive grid of portfolio projects with optional category filtering.', 'proportfolio-showcase' ),
				'content'     => '<!-- wp:proportfolio/portfolio-grid {"count":6,"columns":3,"showFilter":true} /-->',
				'categories'  => array( 'proportfolio' ),
				'keywords'    => array( 'portfolio', 'projects', 'grid', 'gallery' ),
			)
		);
	}

	/**
	 * Register block pattern categories.
	 *
	 * @return void
	 */
	public function register_block_pattern_categories() {
		if ( ! function_exists( 'register_block_pattern_category' ) ) {
			return;
		}

		register_block_pattern_category(
			'proportfolio',
			array(
				'label' => __( 'ProPortfolio', 'proportfolio-showcase' ),
			)
		);
	}
}