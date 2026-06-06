<?php
/**
 * Custom REST API endpoint for portfolio projects.
 *
 * Registers read-only endpoints with filtering, pagination, and caching headers.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * REST API route registration and handler.
 */
class Rest_Api {

	/**
	 * The REST API namespace.
	 *
	 * @var string
	 */
	private $namespace = 'proportfolio/v1';

	/**
	 * Register REST API routes.
	 *
	 * @return void
	 */
	public function register_routes() {
		register_rest_route(
			$this->namespace,
			'/projects',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_projects' ),
				'permission_callback' => array( $this, 'get_projects_permission' ),
				'args'                => $this->get_projects_args(),
			)
		);

		register_rest_route(
			$this->namespace,
			'/projects/(?P<id>\d+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_single_project' ),
				'permission_callback' => array( $this, 'get_single_project_permission' ),
				'args'                => array(
					'id' => array(
						'required'          => true,
						'validate_callback' => function ( $param ) {
							$post = get_post( absint( $param ) );
							return $post && 'portfolio_project' === $post->post_type;
						},
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * Get the arguments for the projects collection endpoint.
	 *
	 * @return array
	 */
	private function get_projects_args() {
		return array(
			'per_page'  => array(
				'default'           => 10,
				'sanitize_callback' => 'absint',
				'validate_callback' => function ( $value ) {
					return absint( $value ) >= 1 && absint( $value ) <= 100;
				},
			),
			'page'      => array(
				'default'           => 1,
				'sanitize_callback' => 'absint',
				'validate_callback' => function ( $value ) {
					return absint( $value ) >= 1;
				},
			),
			'category'  => array(
				'default'           => 0,
				'sanitize_callback' => 'absint',
			),
			'technology' => array(
				'default'           => '',
				'sanitize_callback' => 'sanitize_text_field',
			),
			'featured'  => array(
				'default'           => false,
				'sanitize_callback' => 'rest_sanitize_boolean',
			),
			'search'    => array(
				'default'           => '',
				'sanitize_callback' => 'sanitize_text_field',
			),
		);
	}

	/**
	 * Permission callback for the projects collection endpoint.
	 *
	 * Public data — anyone can read.
	 *
	 * @return bool
	 */
	public function get_projects_permission() {
		/**
		 * Filter the permission for reading portfolio projects via REST API.
		 *
		 * @param bool $permission Whether the request is authorized.
		 */
		return apply_filters( 'proportfolio_rest_projects_permission', true );
	}

	/**
	 * Permission callback for the single project endpoint.
	 *
	 * @return bool
	 */
	public function get_single_project_permission() {
		return apply_filters( 'proportfolio_rest_single_project_permission', true );
	}

	/**
	 * Handle GET /projects — return a paginated list of portfolio projects.
	 *
	 * @param \WP_REST_Request $request The incoming request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_projects( $request ) {
		$per_page   = absint( $request->get_param( 'per_page' ) );
		$page       = absint( $request->get_param( 'page' ) );
		$category   = absint( $request->get_param( 'category' ) );
		$technology = sanitize_text_field( $request->get_param( 'technology' ) );
		$featured   = rest_sanitize_boolean( $request->get_param( 'featured' ) );
		$search     = sanitize_text_field( $request->get_param( 'search' ) );

		$query_args = array(
			'post_type'      => 'portfolio_project',
			'post_status'    => 'publish',
			'posts_per_page' => $per_page,
			'paged'          => $page,
			'no_found_rows'  => false,
		);

		if ( ! empty( $category ) ) {
			$query_args['tax_query'] = array(
				array(
					'taxonomy' => 'project_category',
					'field'    => 'term_id',
					'terms'    => $category,
				),
			);
		}

		if ( ! empty( $technology ) ) {
			$query_args['meta_query'] = array(
				array(
					'key'     => 'project_technologies',
					'value'   => $technology,
					'compare' => 'LIKE',
				),
			);
		}

		if ( $featured ) {
			$query_args['meta_query'] = isset( $query_args['meta_query'] )
				? array_merge( $query_args['meta_query'], array(
					array(
						'key'   => 'project_featured',
						'value' => '1',
					),
				) )
				: array(
					array(
						'key'   => 'project_featured',
						'value' => '1',
					),
				);
		}

		if ( ! empty( $search ) ) {
			$query_args['s'] = $search;
		}

		try {
			$projects = new \WP_Query( $query_args );
		} catch ( \Exception $e ) {
			return new \WP_Error(
				'proportfolio_query_failed',
				__( 'The projects query failed.', 'proportfolio-showcase' ),
				array( 'status' => 500 )
			);
		}

		$data = array();
		foreach ( $projects->posts as $post ) {
			$data[] = $this->prepare_project_item( $post );
		}

		$response = new \WP_REST_Response(
			array(
				'projects'    => $data,
				'total'       => $projects->found_posts,
				'total_pages' => $projects->max_num_pages,
				'page'        => $page,
			),
			200
		);

		// Set pagination headers.
		$response->header( 'X-WP-Total', (string) $projects->found_posts );
		$response->header( 'X-WP-TotalPages', (string) $projects->max_num_pages );
		$response->header( 'X-ProPortfolio-Version', PROPORTFOLIO_VERSION );

		// Cache hint — public data, cache for 1 hour.
		$response->header( 'Cache-Control', 'public, max-age=3600' );

		return $response;
	}

	/**
	 * Handle GET /projects/{id} — return a single project with full details.
	 *
	 * @param \WP_REST_Request $request The incoming request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_single_project( $request ) {
		$post_id = absint( $request->get_param( 'id' ) );
		$post    = get_post( $post_id );

		if ( ! $post || 'portfolio_project' !== $post->post_type || 'publish' !== $post->post_status ) {
			return new \WP_Error(
				'proportfolio_not_found',
				__( 'Project not found.', 'proportfolio-showcase' ),
				array( 'status' => 404 )
			);
		}

		$item = $this->prepare_project_item( $post );

		// Add extended data for single view.
		$item['content']            = apply_filters( 'the_content', $post->post_content );
		$item['excerpt']            = apply_filters( 'the_excerpt', $post->post_excerpt );
		$item['categories']         = $this->get_project_categories( $post_id );
		$item['previous_project_id'] = $this->get_adjacent_project( $post_id, 'previous' );
		$item['next_project_id']    = $this->get_adjacent_project( $post_id, 'next' );

		$response = new \WP_REST_Response( $item, 200 );
		$response->header( 'Cache-Control', 'public, max-age=3600' );
		$response->header( 'X-ProPortfolio-Version', PROPORTFOLIO_VERSION );

		return $response;
	}

	/**
	 * Prepare a single project item for API response.
	 *
	 * @param \WP_Post $post The post object.
	 * @return array Prepared data array.
	 */
	private function prepare_project_item( $post ) {
		$post_id      = $post->ID;
		$technologies = get_post_meta( $post_id, 'project_technologies', true );
		$thumbnail_id = get_post_thumbnail_id( $post_id );
		$thumbnail    = $thumbnail_id
			? wp_get_attachment_image_url( $thumbnail_id, 'medium_large' )
			: get_placeholder_thumbnail( $post_id );

		return array(
			'id'                => $post_id,
			'title'             => esc_html( get_the_title( $post ) ),
			'slug'              => $post->post_name,
			'url'               => esc_url( get_permalink( $post ) ),
			'excerpt'           => esc_html( get_the_excerpt( $post ) ),
			'thumbnail_url'     => esc_url( $thumbnail ),
			'client'            => esc_html( get_post_meta( $post_id, 'project_client', true ) ),
			'completion_date'   => esc_html( get_post_meta( $post_id, 'project_completion_date', true ) ),
			'technologies'      => is_array( $technologies ) ? array_map( 'esc_html', $technologies ) : array(),
			'featured'          => (bool) get_post_meta( $post_id, 'project_featured', true ),
			'project_url'       => esc_url( get_post_meta( $post_id, 'project_url', true ) ),
			'testimonial'       => esc_html( get_post_meta( $post_id, 'project_testimonial', true ) ),
			'testimonial_author' => esc_html( get_post_meta( $post_id, 'project_testimonial_author', true ) ),
			'date'              => get_the_date( 'c', $post ),
			'date_display'      => get_the_date( '', $post ),
		);
	}

	/**
	 * Get categories for a project with full label/slug/link data.
	 *
	 * @param int $post_id Post ID.
	 * @return array
	 */
	private function get_project_categories( $post_id ) {
		$terms = wp_get_post_terms( $post_id, 'project_category', array( 'fields' => 'all' ) );

		if ( is_wp_error( $terms ) || empty( $terms ) ) {
			return array();
		}

		$data = array();
		foreach ( $terms as $term ) {
			$data[] = array(
				'id'   => $term->term_id,
				'name' => esc_html( $term->name ),
				'slug' => $term->slug,
				'link' => esc_url( get_term_link( $term ) ),
			);
		}

		return $data;
	}

	/**
	 * Get the adjacent portfolio project ID (previous or next).
	 *
	 * @param int    $post_id Current post ID.
	 * @param string $direction 'previous' or 'next'.
	 * @return int|null Adjacent post ID or null.
	 */
	private function get_adjacent_project( $post_id, $direction = 'next' ) {
		$adjacent = get_adjacent_post(
			false,
			'',
			'previous' === $direction,
			'project_category'
		);

		return $adjacent ? $adjacent->ID : null;
	}
}