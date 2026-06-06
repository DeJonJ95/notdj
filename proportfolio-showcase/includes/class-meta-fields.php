<?php
/**
 * Meta field registration and admin meta boxes.
 *
 * Registers custom fields natively via register_meta() with REST API exposure.
 * Optionally uses Advanced Custom Fields if available for a richer editing UI.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * Handles registration and management of portfolio project meta fields.
 */
class Meta_Fields {

	/**
	 * Array of field definitions.
	 *
	 * @var array
	 */
	private $fields = array();

	/**
	 * Constructor — defines the field schema.
	 */
	public function __construct() {
		$this->fields = $this->define_fields();
	}

	/**
	 * Define all custom meta fields for portfolio projects.
	 *
	 * @return array
	 */
	private function define_fields() {
		return array(
			'project_url'              => array(
				'label'             => __( 'Project URL', 'proportfolio-showcase' ),
				'type'              => 'url',
				'description'       => __( 'The live URL of this project.', 'proportfolio-showcase' ),
				'sanitize_callback' => 'esc_url_raw',
				'default'           => '',
				'show_in_rest'      => true,
			),
			'project_client'           => array(
				'label'             => __( 'Client', 'proportfolio-showcase' ),
				'type'              => 'text',
				'description'       => __( 'The client or organization this project was built for.', 'proportfolio-showcase' ),
				'sanitize_callback' => 'sanitize_text_field',
				'default'           => '',
				'show_in_rest'      => true,
			),
			'project_completion_date'  => array(
				'label'             => __( 'Completion Date', 'proportfolio-showcase' ),
				'type'              => 'date',
				'description'       => __( 'When this project was completed (YYYY-MM-DD).', 'proportfolio-showcase' ),
				'sanitize_callback' => __NAMESPACE__ . '\sanitize_date',
				'default'           => '',
				'show_in_rest'      => true,
			),
			'project_technologies'     => array(
				'label'             => __( 'Technologies Used', 'proportfolio-showcase' ),
				'type'              => 'textarea',
				'description'       => __( 'Comma-separated list of technologies (e.g. WordPress, React, Stripe).', 'proportfolio-showcase' ),
				'sanitize_callback' => __NAMESPACE__ . '\sanitize_technologies',
				'default'           => array(),
				'show_in_rest'      => array(
					'schema' => array(
						'type'  => 'array',
						'items' => array(
							'type' => 'string',
						),
					),
				),
			),
			'project_featured'         => array(
				'label'             => __( 'Featured Project', 'proportfolio-showcase' ),
				'type'              => 'checkbox',
				'description'       => __( 'Check to mark this as a featured / highlighted project.', 'proportfolio-showcase' ),
				'sanitize_callback' => 'rest_sanitize_boolean',
				'default'           => false,
				'show_in_rest'      => true,
			),
			'project_testimonial'      => array(
				'label'             => __( 'Client Testimonial', 'proportfolio-showcase' ),
				'type'              => 'textarea',
				'description'       => __( 'A quote or testimonial from the client about this project.', 'proportfolio-showcase' ),
				'sanitize_callback' => 'sanitize_textarea_field',
				'default'           => '',
				'show_in_rest'      => true,
			),
			'project_testimonial_author' => array(
				'label'             => __( 'Testimonial Author', 'proportfolio-showcase' ),
				'type'              => 'text',
				'description'       => __( 'The name of the person who gave the testimonial.', 'proportfolio-showcase' ),
				'sanitize_callback' => 'sanitize_text_field',
				'default'           => '',
				'show_in_rest'      => true,
			),
		);
	}

	/**
	 * Register all meta fields with WordPress via register_meta().
	 *
	 * Called on 'init'.
	 *
	 * @return void
	 */
	public function register_all_fields() {
		// If ACF is active, register via ACF for a richer editing experience.
		if ( function_exists( 'acf_add_local_field_group' ) ) {
			$this->register_via_acf();
			return;
		}

		// Native registration fallback.
		foreach ( $this->fields as $key => $field ) {
			$args = array(
				'object_subtype'    => 'portfolio_project',
				'type'              => ( 'checkbox' === $field['type'] ) ? 'boolean' : 'string',
				'description'       => $field['description'],
				'single'            => true,
				'default'           => $field['default'],
				'sanitize_callback' => $field['sanitize_callback'],
				'auth_callback'     => function ( $allowed, $meta_key, $post_id, $user_id, $cap, $caps ) {
					return user_can( $user_id, 'edit_post', $post_id );
				},
				'show_in_rest'      => $field['show_in_rest'],
			);

			register_meta( 'post', $key, $args );
		}
	}

	/**
	 * Register fields using ACF's local API for a richer editing experience.
	 *
	 * Only called when ACF is active and available.
	 *
	 * @return void
	 */
	private function register_via_acf() {
		$acf_fields = array();

		foreach ( $this->fields as $key => $field ) {
			$acf_field = array(
				'key'           => 'field_' . $key,
				'label'         => $field['label'],
				'name'          => $key,
				'type'          => $this->map_to_acf_type( $field['type'] ),
				'instructions'  => $field['description'],
				'required'      => 0,
				'default_value' => $field['default'],
				'wrapper'       => array(
					'width' => '',
				),
			);

			// Type-specific configuration.
			if ( 'textarea' === $field['type'] && 'project_technologies' === $key ) {
				$acf_field['placeholder'] = __( 'WordPress, React, Stripe, ...', 'proportfolio-showcase' );
			}

			$acf_fields[] = $acf_field;
		}

		acf_add_local_field_group(
			array(
				'key'                   => 'group_proportfolio_project_details',
				'title'                 => __( 'Project Details', 'proportfolio-showcase' ),
				'fields'                => $acf_fields,
				'location'              => array(
					array(
						array(
							'param'    => 'post_type',
							'operator' => '==',
							'value'    => 'portfolio_project',
						),
					),
				),
				'menu_order'            => 0,
				'position'              => 'normal',
				'style'                 => 'default',
				'label_placement'       => 'top',
				'instruction_placement' => 'label',
				'hide_on_screen'        => '',
				'active'               => true,
				'description'           => __( 'Custom fields for portfolio projects.', 'proportfolio-showcase' ),
				'show_in_rest'          => true,
			)
		);
	}

	/**
	 * Map plugin field types to ACF field types.
	 *
	 * @param string $type Internal field type.
	 * @return string ACF field type.
	 */
	private function map_to_acf_type( $type ) {
		$map = array(
			'text'     => 'text',
			'url'      => 'url',
			'date'     => 'date_picker',
			'textarea' => 'textarea',
			'checkbox' => 'true_false',
		);

		return isset( $map[ $type ] ) ? $map[ $type ] : 'text';
	}

	/**
	 * Add meta boxes for portfolio project fields.
	 *
	 * @return void
	 */
	public function add_meta_boxes() {
		// Skip native meta boxes if ACF is handling them.
		if ( function_exists( 'acf_add_local_field_group' ) ) {
			return;
		}

		add_meta_box(
			'portfolio_project_details',
			__( 'Project Details', 'proportfolio-showcase' ),
			array( $this, 'render_details_meta_box' ),
			'portfolio_project',
			'normal',
			'high'
		);

		add_meta_box(
			'portfolio_project_testimonial',
			__( 'Client Testimonial', 'proportfolio-showcase' ),
			array( $this, 'render_testimonial_meta_box' ),
			'portfolio_project',
			'normal',
			'default'
		);
	}

	/**
	 * Render the Project Details meta box.
	 *
	 * @param \WP_Post $post Current post object.
	 * @return void
	 */
	public function render_details_meta_box( $post ) {
		wp_nonce_field( 'proportfolio_save_meta', 'proportfolio_meta_nonce' );

		$fields_to_show = array( 'project_url', 'project_client', 'project_completion_date', 'project_technologies', 'project_featured' );

		foreach ( $fields_to_show as $key ) {
			$field      = $this->fields[ $key ];
			$value      = get_post_meta( $post->ID, $key, true );
			$field_id   = 'proportfolio-' . str_replace( '_', '-', $key );
			$field_name = 'proportfolio_' . $key;
			?>
			<div class="proportfolio-field" style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #eee;">
				<label for="<?php echo esc_attr( $field_id ); ?>" style="display: block; font-weight: 600; margin-bottom: 4px;">
					<?php echo esc_html( $field['label'] ); ?>
				</label>

				<?php if ( 'text' === $field['type'] ) : ?>
					<input
						type="text"
						id="<?php echo esc_attr( $field_id ); ?>"
						name="<?php echo esc_attr( $field_name ); ?>"
						value="<?php echo esc_attr( $value ); ?>"
						class="large-text"
					/>

				<?php elseif ( 'url' === $field['type'] ) : ?>
					<input
						type="url"
						id="<?php echo esc_attr( $field_id ); ?>"
						name="<?php echo esc_attr( $field_name ); ?>"
						value="<?php echo esc_attr( $value ); ?>"
						class="large-text"
						placeholder="https://"
					/>

				<?php elseif ( 'date' === $field['type'] ) : ?>
					<input
						type="date"
						id="<?php echo esc_attr( $field_id ); ?>"
						name="<?php echo esc_attr( $field_name ); ?>"
						value="<?php echo esc_attr( $value ); ?>"
						class="regular-text"
						pattern="\d{4}-\d{2}-\d{2}"
					/>

				<?php elseif ( 'textarea' === $field['type'] ) : ?>
					<textarea
						id="<?php echo esc_attr( $field_id ); ?>"
						name="<?php echo esc_attr( $field_name ); ?>"
						class="large-text"
						rows="3"
					><?php echo esc_textarea( is_array( $value ) ? implode( ', ', $value ) : $value ); ?></textarea>

				<?php elseif ( 'checkbox' === $field['type'] ) : ?>
					<label>
						<input
							type="checkbox"
							id="<?php echo esc_attr( $field_id ); ?>"
							name="<?php echo esc_attr( $field_name ); ?>"
							value="1"
							<?php checked( (bool) $value, true ); ?>
						/>
						<?php echo esc_html( $field['description'] ); ?>
					</label>
				<?php endif; ?>

				<?php if ( 'checkbox' !== $field['type'] && ! empty( $field['description'] ) ) : ?>
					<p class="description" style="margin: 2px 0 0;">
						<?php echo esc_html( $field['description'] ); ?>
					</p>
				<?php endif; ?>
			</div>
			<?php
		}
	}

	/**
	 * Render the Client Testimonial meta box.
	 *
	 * @param \WP_Post $post Current post object.
	 * @return void
	 */
	public function render_testimonial_meta_box( $post ) {
		$testimonial       = get_post_meta( $post->ID, 'project_testimonial', true );
		$testimonial_author = get_post_meta( $post->ID, 'project_testimonial_author', true );
		?>
		<div class="proportfolio-field" style="margin-bottom: 16px;">
			<label for="proportfolio-project-testimonial" style="display: block; font-weight: 600; margin-bottom: 4px;">
				<?php esc_html_e( 'Testimonial Quote', 'proportfolio-showcase' ); ?>
			</label>
			<textarea
				id="proportfolio-project-testimonial"
				name="proportfolio_project_testimonial"
				class="large-text"
				rows="4"
				placeholder="<?php esc_attr_e( 'What did the client say about this project?', 'proportfolio-showcase' ); ?>"
			><?php echo esc_textarea( $testimonial ); ?></textarea>
		</div>

		<div class="proportfolio-field">
			<label for="proportfolio-project-testimonial-author" style="display: block; font-weight: 600; margin-bottom: 4px;">
				<?php esc_html_e( 'Testimonial Author', 'proportfolio-showcase' ); ?>
			</label>
			<input
				type="text"
				id="proportfolio-project-testimonial-author"
				name="proportfolio_project_testimonial_author"
				value="<?php echo esc_attr( $testimonial_author ); ?>"
				class="large-text"
				placeholder="<?php esc_attr_e( 'e.g., Jane Doe, CEO at Example Co.', 'proportfolio-showcase' ); ?>"
			/>
		</div>
		<?php
	}

	/**
	 * Save meta box field values.
	 *
	 * Includes nonce verification, autosave/revision checks, capability checks,
	 * sanitization, and conditional update.
	 *
	 * @param int $post_id Post ID being saved.
	 * @return void
	 */
	public function save_meta_box( $post_id ) {
		// Nonce verification.
		if ( ! isset( $_POST['proportfolio_meta_nonce'] )
			|| ! wp_verify_nonce( sanitize_key( $_POST['proportfolio_meta_nonce'] ), 'proportfolio_save_meta' ) ) {
			return;
		}

		// Prevent autosave and revisions from overwriting.
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}

		if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}

		// Capability check.
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		// Save each field.
		$fields_to_save = array(
			'proportfolio_project_url'              => 'project_url',
			'proportfolio_project_client'           => 'project_client',
			'proportfolio_project_completion_date'  => 'project_completion_date',
			'proportfolio_project_technologies'     => 'project_technologies',
			'proportfolio_project_featured'         => 'project_featured',
			'proportfolio_project_testimonial'      => 'project_testimonial',
			'proportfolio_project_testimonial_author' => 'project_testimonial_author',
		);

		foreach ( $fields_to_save as $post_key => $meta_key ) {
			if ( ! isset( $this->fields[ $meta_key ] ) ) {
				continue;
			}

			$field = $this->fields[ $meta_key ];

			if ( 'checkbox' === $field['type'] ) {
				$value = isset( $_POST[ $post_key ] ) ? '1' : '0';
			} elseif ( ! isset( $_POST[ $post_key ] ) ) {
				continue;
			} else {
				// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
				$raw_value = wp_unslash( $_POST[ $post_key ] );
				$value     = call_user_func( $field['sanitize_callback'], $raw_value );
			}

			update_post_meta( $post_id, $meta_key, $value );
		}
	}
}