<?php
/**
 * Uninstall handler for ProPortfolio Showcase.
 *
 * Cleans up all plugin data when the plugin is deleted via wp-admin.
 *
 * @package ProPortfolio_Showcase
 */

// Exit if not called by WordPress uninstall process.
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Delete all portfolio_project posts.
 */
$projects = get_posts(
	array(
		'post_type'      => 'portfolio_project',
		'posts_per_page' => -1,
		'post_status'    => 'any',
		'fields'         => 'ids',
	)
);

foreach ( $projects as $post_id ) {
	wp_delete_post( $post_id, true ); // Force delete (skip trash).
}

/**
 * Delete all project_category terms.
 */
$terms = get_terms(
	array(
		'taxonomy'   => 'project_category',
		'hide_empty' => false,
		'fields'     => 'ids',
	)
);

if ( ! is_wp_error( $terms ) ) {
	foreach ( $terms as $term_id ) {
		wp_delete_term( $term_id, 'project_category' );
	}
}

/**
 * Delete all post meta registered by the plugin.
 */
$meta_keys = array(
	'project_url',
	'project_client',
	'project_completion_date',
	'project_technologies',
	'project_featured',
	'project_testimonial',
	'project_testimonial_author',
);

foreach ( $meta_keys as $meta_key ) {
	delete_post_meta_by_key( $meta_key );
}

/**
 * Delete all plugin options.
 */
delete_option( 'proportfolio_options' );
delete_option( '_proportfolio_demo_seeded' );
delete_option( 'proportfolio_version' );

/**
 * Clean up transients.
 */
delete_transient( 'proportfolio_show_setup_wizard' );
delete_transient( 'proportfolio_admin_message' );

/**
 * Flush rewrite rules to remove CPT rewrite rules.
 */
flush_rewrite_rules();