<?php
/**
 * Helper functions for ProPortfolio Showcase.
 *
 * Reusable utility functions shared across the plugin classes.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * Validate a date string in YYYY-MM-DD format.
 *
 * @param string $date Raw date string.
 * @return string Sanitized date or empty string if invalid.
 */
function sanitize_date( $date ) {
	if ( empty( $date ) ) {
		return '';
	}

	$date = sanitize_text_field( $date );

	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
		return '';
	}

	$timestamp = strtotime( $date );
	if ( false === $timestamp ) {
		return '';
	}

	return gmdate( 'Y-m-d', $timestamp );
}

/**
 * Sanitize a list of technology names.
 *
 * Accepts either a comma-separated string or an array.
 *
 * @param array|string $technologies Raw technologies input.
 * @return array Clean array of technology strings.
 */
function sanitize_technologies( $technologies ) {
	if ( is_string( $technologies ) ) {
		$technologies = explode( ',', $technologies );
	}

	if ( ! is_array( $technologies ) ) {
		return array();
	}

	$cleaned = array();
	foreach ( $technologies as $tech ) {
		$tech = sanitize_text_field( trim( (string) $tech ) );
		if ( ! empty( $tech ) ) {
			$cleaned[] = $tech;
		}
	}

	return array_unique( $cleaned );
}

/**
 * Get all unique technology values used across portfolio projects.
 *
 * @return array Sorted array of technology strings.
 */
function get_technology_terms() {
	global $wpdb;

	$meta_values = $wpdb->get_col(
		$wpdb->prepare(
			"SELECT DISTINCT meta_value FROM {$wpdb->postmeta} WHERE meta_key = %s AND meta_value != ''",
			'project_technologies'
		)
	);

	$all_techs = array();
	foreach ( $meta_values as $value ) {
		$techs = maybe_unserialize( $value );
		if ( is_array( $techs ) ) {
			$all_techs = array_merge( $all_techs, $techs );
		}
	}

	$all_techs = array_unique( array_filter( array_map( 'sanitize_text_field', $all_techs ) ) );
	sort( $all_techs );

	return $all_techs;
}

/**
 * Get plugin options with defaults.
 *
 * @param string $key Optional specific option key.
 * @return mixed Single option value or full array of options.
 */
function get_portfolio_options( $key = '' ) {
	$defaults = array(
		'archive_heading'          => __( 'Portfolio', 'proportfolio-showcase' ),
		'projects_per_page'        => 12,
		'default_sort'             => 'date',
		'default_sort_order'       => 'DESC',
		'enforce_featured_image'   => false,
		'cpt_rewrite_slug'         => 'portfolio',
	);

	$options = get_option( 'proportfolio_options', array() );
	$options = wp_parse_args( $options, $defaults );

	if ( ! empty( $key ) ) {
		return isset( $options[ $key ] ) ? $options[ $key ] : $defaults[ $key ];
	}

	return $options;
}

/**
 * Get a placeholder SVG data URI when no featured image is set.
 *
 * @param int    $post_id Post ID (unused but consistent with attachment calls).
 * @param string $size    Image size label (unused, always returns SVG).
 * @return string Data URI for a placeholder SVG.
 */
function get_placeholder_thumbnail( $post_id = 0, $size = 'medium' ) {
	$colors = array( '#4A90D9', '#7B61FF', '#E06C75', '#56B6C2', '#E5C07B', '#98C379' );
	$color  = $colors[ $post_id % count( $colors ) ];

	$svg = sprintf(
		'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="375" viewBox="0 0 600 375">
			<rect width="600" height="375" fill="%s" rx="8"/>
			<text x="300" y="187" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-family="system-ui,sans-serif" font-size="48" font-weight="600">%s</text>
		</svg>',
		esc_attr( $color ),
		esc_html__( 'Project', 'proportfolio-showcase' )
	);

	return 'data:image/svg+xml;charset=utf-8,' . rawurlencode( $svg );
}

/**
 * Check if a demo data has been seeded.
 *
 * @return bool
 */
function has_demo_data() {
	return (bool) get_option( '_proportfolio_demo_seeded', false );
}