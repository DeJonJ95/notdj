<?php
/**
 * Custom Post Type and Taxonomy registration.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * Handles registration of the portfolio_project CPT and project_category taxonomy.
 */
class Post_Types {

	/**
	 * Register the CPT and taxonomy on the 'init' hook.
	 *
	 * @return void
	 */
	public function register() {
		self::register_cpt();
		self::register_taxonomies();
	}

	/**
	 * Register the portfolio_project custom post type.
	 *
	 * @return void
	 */
	public static function register_cpt() {
		$labels = array(
			'name'                  => _x( 'Portfolio Projects', 'Post type general name', 'proportfolio-showcase' ),
			'singular_name'         => _x( 'Portfolio Project', 'Post type singular name', 'proportfolio-showcase' ),
			'menu_name'             => _x( 'Portfolio', 'Admin menu name', 'proportfolio-showcase' ),
			'name_admin_bar'        => _x( 'Portfolio Project', 'Admin bar name', 'proportfolio-showcase' ),
			'add_new'               => __( 'Add New', 'proportfolio-showcase' ),
			'add_new_item'          => __( 'Add New Project', 'proportfolio-showcase' ),
			'new_item'              => __( 'New Project', 'proportfolio-showcase' ),
			'edit_item'             => __( 'Edit Project', 'proportfolio-showcase' ),
			'view_item'             => __( 'View Project', 'proportfolio-showcase' ),
			'all_items'             => __( 'All Projects', 'proportfolio-showcase' ),
			'search_items'          => __( 'Search Projects', 'proportfolio-showcase' ),
			'parent_item_colon'     => __( 'Parent Project:', 'proportfolio-showcase' ),
			'not_found'             => __( 'No projects found.', 'proportfolio-showcase' ),
			'not_found_in_trash'    => __( 'No projects found in Trash.', 'proportfolio-showcase' ),
			'featured_image'        => _x( 'Project Thumbnail', 'Overrides the "Featured Image" label', 'proportfolio-showcase' ),
			'set_featured_image'    => _x( 'Set project thumbnail', 'Overrides the "Set featured image" label', 'proportfolio-showcase' ),
			'remove_featured_image' => _x( 'Remove project thumbnail', 'Overrides the "Remove featured image" label', 'proportfolio-showcase' ),
			'use_featured_image'    => _x( 'Use as project thumbnail', 'Overrides the "Use as featured image" label', 'proportfolio-showcase' ),
			'archives'              => _x( 'Project Archives', 'Post type archive label', 'proportfolio-showcase' ),
			'insert_into_item'      => _x( 'Insert into project', 'Overrides the "Insert into post" label', 'proportfolio-showcase' ),
			'uploaded_to_this_item' => _x( 'Uploaded to this project', 'Overrides the "Uploaded to this post" label', 'proportfolio-showcase' ),
			'filter_items_list'     => _x( 'Filter projects list', 'Screen reader text for filter links', 'proportfolio-showcase' ),
			'items_list_navigation' => _x( 'Projects list navigation', 'Screen reader text for pagination', 'proportfolio-showcase' ),
			'items_list'            => _x( 'Projects list', 'Screen reader text for the list heading', 'proportfolio-showcase' ),
		);

		$rewrite_slug = get_portfolio_options( 'cpt_rewrite_slug' );

		$args = array(
			'labels'              => $labels,
			'public'              => true,
			'has_archive'         => true,
			'show_in_rest'        => true,
			'rest_base'           => 'portfolio',
			'supports'            => array( 'title', 'editor', 'thumbnail', 'excerpt', 'custom-fields', 'revisions', 'author' ),
			'menu_icon'           => 'dashicons-portfolio',
			'rewrite'             => array(
				'slug'       => $rewrite_slug,
				'with_front' => false,
			),

			'publicly_queryable'  => true,
			'show_ui'             => true,
			'show_in_menu'        => true,
			'query_var'           => true,
			'capability_type'     => 'post',
			'hierarchical'        => false,
			'menu_position'       => 5,
			'exclude_from_search' => false,
			'can_export'          => true,
			'delete_with_user'    => false,
			'taxonomies'          => array( 'project_category' ),
		);

		/**
		 * Filter the portfolio_project post type arguments.
		 *
		 * @param array $args CPT registration arguments.
		 */
		$args = apply_filters( 'proportfolio_cpt_args', $args );

		register_post_type( 'portfolio_project', $args );
	}

	/**
	 * Register custom taxonomies.
	 *
	 * @return void
	 */
	public static function register_taxonomies() {
		$labels = array(
			'name'              => _x( 'Project Categories', 'Taxonomy general name', 'proportfolio-showcase' ),
			'singular_name'     => _x( 'Project Category', 'Taxonomy singular name', 'proportfolio-showcase' ),
			'search_items'      => __( 'Search Categories', 'proportfolio-showcase' ),
			'all_items'         => __( 'All Categories', 'proportfolio-showcase' ),
			'parent_item'       => __( 'Parent Category', 'proportfolio-showcase' ),
			'parent_item_colon' => __( 'Parent Category:', 'proportfolio-showcase' ),
			'edit_item'         => __( 'Edit Category', 'proportfolio-showcase' ),
			'update_item'       => __( 'Update Category', 'proportfolio-showcase' ),
			'add_new_item'      => __( 'Add New Category', 'proportfolio-showcase' ),
			'new_item_name'     => __( 'New Category Name', 'proportfolio-showcase' ),
			'menu_name'         => __( 'Categories', 'proportfolio-showcase' ),
			'not_found'         => __( 'No categories found.', 'proportfolio-showcase' ),
		);

		$args = array(
			'hierarchical'      => true,
			'labels'            => $labels,
			'show_ui'           => true,
			'show_admin_column' => true,
			'show_in_rest'      => true,
			'rest_base'         => 'project-categories',
			'query_var'         => true,
			'rewrite'           => array(
				'slug'       => 'portfolio/category',
				'with_front' => false,
			),
		);

		/**
		 * Filter the project_category taxonomy arguments.
		 *
		 * @param array $args Taxonomy registration arguments.
		 */
		$args = apply_filters( 'proportfolio_taxonomy_args', $args );

		register_taxonomy( 'project_category', 'portfolio_project', $args );
	}

	/**
	 * Customize post-updated messages for the CPT.
	 *
	 * @param array $messages Existing post-updated messages.
	 * @return array Modified messages.
	 */
	public function updated_messages( $messages ) {
		$post             = get_post();
		$post_type        = get_post_type( $post );
		$post_type_object = get_post_type_object( $post_type );

		if ( 'portfolio_project' !== $post_type ) {
			return $messages;
		}

		$permalink = get_permalink( $post->ID );

		$messages['portfolio_project'] = array(
			0  => '', // Unused. Messages start at index 1.
			1  => __( 'Project updated.', 'proportfolio-showcase' ),
			2  => __( 'Custom field updated.', 'proportfolio-showcase' ),
			3  => __( 'Custom field deleted.', 'proportfolio-showcase' ),
			4  => __( 'Project updated.', 'proportfolio-showcase' ),
			5  => isset( $_GET['revision'] ) ?
				sprintf(
				/* translators: %s: revision title */
					__( 'Project restored to revision from %s.', 'proportfolio-showcase' ),
					wp_post_revision_title( (int) $_GET['revision'], false )
				) : false,
			6  => __( 'Project published.', 'proportfolio-showcase' ),
			7  => __( 'Project saved.', 'proportfolio-showcase' ),
			8  => __( 'Project submitted.', 'proportfolio-showcase' ),
			9  => sprintf(
			/* translators: %1$s: post date */
				__( 'Project scheduled for: %1$s.', 'proportfolio-showcase' ),
				date_i18n( __( 'M j, Y @ G:i', 'proportfolio-showcase' ), strtotime( $post->post_date ) )
			),
			10 => __( 'Project draft updated.', 'proportfolio-showcase' ),
		);

		if ( $post_type_object->publicly_queryable && $permalink ) {
			$messages['portfolio_project'][6] = sprintf(
			/* translators: %s: post permalink */
				__( 'Project published. <a href="%s">View project</a>.', 'proportfolio-showcase' ),
				esc_url( $permalink )
			);
			$messages['portfolio_project'][9] = sprintf(
			/* translators: %1$s: post date, %2$s: post permalink */
				__( 'Project scheduled for: <strong>%1$s</strong>. <a target="_blank" href="%2$s">Preview project</a>.', 'proportfolio-showcase' ),
				date_i18n( __( 'M j, Y @ G:i', 'proportfolio-showcase' ), strtotime( $post->post_date ) ),
				esc_url( $permalink )
			);
			$messages['portfolio_project'][10] = sprintf(
			/* translators: %s: post permalink */
				__( 'Project draft updated. <a target="_blank" href="%s">Preview project</a>.', 'proportfolio-showcase' ),
				esc_url( add_query_arg( 'preview', 'true', $permalink ) )
			);
		}

		return $messages;
	}

	/**
	 * Customize bulk-updated messages for the CPT.
	 *
	 * @param array $bulk_messages Existing bulk messages.
	 * @param array $bulk_counts   Counts of affected posts.
	 * @return array Modified messages.
	 */
	public function bulk_updated_messages( $bulk_messages, $bulk_counts ) {
		$bulk_messages['portfolio_project'] = array(
		/* translators: %s: number of projects */
			'updated'   => _n( '%s project updated.', '%s projects updated.', $bulk_counts['updated'], 'proportfolio-showcase' ),
			'locked'    => _n( '%s project not updated, somebody is editing it.', '%s projects not updated, somebody is editing them.', $bulk_counts['locked'], 'proportfolio-showcase' ),
			'deleted'   => _n( '%s project permanently deleted.', '%s projects permanently deleted.', $bulk_counts['deleted'], 'proportfolio-showcase' ),
			'trashed'   => _n( '%s project moved to the Trash.', '%s projects moved to the Trash.', $bulk_counts['trashed'], 'proportfolio-showcase' ),
			'untrashed' => _n( '%s project restored from the Trash.', '%s projects restored from the Trash.', $bulk_counts['untrashed'], 'proportfolio-showcase' ),
		);

		return $bulk_messages;
	}

	/**
	 * Provide a default single template from the plugin if the theme lacks one.
	 *
	 * @param string $template Path to the template file.
	 * @return string Filtered template path.
	 */
	public function single_template( $template ) {
		global $post;

		if ( 'portfolio_project' === $post->post_type ) {
			$theme_template = locate_template( 'single-portfolio_project.php' );
			if ( empty( $theme_template ) ) {
				$plugin_template = PROPORTFOLIO_PATH . 'templates/single-portfolio_project.php';
				if ( file_exists( $plugin_template ) ) {
					return $plugin_template;
				}
			}
		}

		return $template;
	}

	/**
	 * Provide a default archive template from the plugin if the theme lacks one.
	 *
	 * @param string $template Path to the template file.
	 * @return string Filtered template path.
	 */
	public function archive_template( $template ) {
		if ( is_post_type_archive( 'portfolio_project' ) || is_tax( 'project_category' ) ) {
			$theme_template = locate_template( array( 'archive-portfolio_project.php', 'archive.php' ) );
			if ( empty( $theme_template ) ) {
				$plugin_template = PROPORTFOLIO_PATH . 'templates/archive-portfolio_project.php';
				if ( file_exists( $plugin_template ) ) {
					return $plugin_template;
				}
			}
		}

		return $template;
	}
}