<?php
/**
 * Admin settings page, custom columns, and notices.
 *
 * @package ProPortfolio_Showcase
 */

namespace ProPortfolio\Includes;

defined( 'ABSPATH' ) || exit;

/**
 * Handles all WordPress admin customizations for the plugin.
 */
class Admin {

	/**
	 * Add the admin menu page.
	 *
	 * @return void
	 */
	public function add_admin_menu() {
		add_menu_page(
			__( 'ProPortfolio Showcase', 'proportfolio-showcase' ),
			__( 'ProPortfolio', 'proportfolio-showcase' ),
			'manage_options',
			'proportfolio',
			array( $this, 'render_settings_page' ),
			'dashicons-portfolio',
		);
	}

	/**
	 * Register plugin settings.
	 *
	 * @return void
	 */
	public function register_settings() {
		register_setting(
			'proportfolio_settings',
			'proportfolio_options',
			array(
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
				'default'           => array(),
			)
		);

		add_settings_section(
			'proportfolio_main_section',
			__( 'General Settings', 'proportfolio-showcase' ),
			function () {
				echo '<p>' . esc_html__( 'Configure how your portfolio projects are displayed.', 'proportfolio-showcase' ) . '</p>';
			},
			'proportfolio'
		);

		add_settings_field(
			'archive_heading',
			__( 'Archive Page Heading', 'proportfolio-showcase' ),
			array( $this, 'render_text_field' ),
			'proportfolio',
			'proportfolio_main_section',
			array(
				'label_for' => 'archive_heading',
				'option'    => 'archive_heading',
			)
		);

		add_settings_field(
			'projects_per_page',
			__( 'Projects Per Page', 'proportfolio-showcase' ),
			array( $this, 'render_number_field' ),
			'proportfolio',
			'proportfolio_main_section',
			array(
				'label_for' => 'projects_per_page',
				'option'    => 'projects_per_page',
				'min'       => 1,
				'max'       => 100,
			)
		);

		add_settings_field(
			'cpt_rewrite_slug',
			__( 'Portfolio URL Slug', 'proportfolio-showcase' ),
			array( $this, 'render_text_field' ),
			'proportfolio',
			'proportfolio_main_section',
			array(
				'label_for'   => 'cpt_rewrite_slug',
				'option'      => 'cpt_rewrite_slug',
				'description' => __( 'Warning: Changing this after content exists will break existing URLs. Regenerate permalinks after changing.', 'proportfolio-showcase' ),
			)
		);
	}

	/**
	 * Render the settings page with tabs.
	 *
	 * @return void
	 */
	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have sufficient permissions to access this page.', 'proportfolio-showcase' ) );
		}

		$active_tab = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'settings';
		?>
		<div class="wrap">
			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

			<nav class="nav-tab-wrapper">
				<a href="?page=proportfolio&tab=settings" class="nav-tab <?php echo 'settings' === $active_tab ? 'nav-tab-active' : ''; ?>">
					<?php esc_html_e( 'Settings', 'proportfolio-showcase' ); ?>
				</a>
				<a href="?page=proportfolio&tab=demo-data" class="nav-tab <?php echo 'demo-data' === $active_tab ? 'nav-tab-active' : ''; ?>">
					<?php esc_html_e( 'Demo Data', 'proportfolio-showcase' ); ?>
				</a>
				<a href="?page=proportfolio&tab=help" class="nav-tab <?php echo 'help' === $active_tab ? 'nav-tab-active' : ''; ?>">
					<?php esc_html_e( 'Help', 'proportfolio-showcase' ); ?>
				</a>
			</nav>

			<div class="tab-content" style="margin-top: 20px;">
				<?php
				switch ( $active_tab ) {
					case 'demo-data':
						$this->render_demo_data_tab();
						break;
					case 'help':
						$this->render_help_tab();
						break;
					default:
						$this->render_settings_tab();
						break;
				}
				?>
			</div>
		</div>
		<?php
	}

	/**
	 * Render the Settings tab.
	 *
	 * @return void
	 */
	private function render_settings_tab() {
		?>
		<form action="options.php" method="post">
			<?php
			settings_fields( 'proportfolio_settings' );
			do_settings_sections( 'proportfolio' );
			submit_button();
			?>
		</form>
		<?php
	}

	/**
	 * Render the Demo Data tab.
	 *
	 * @return void
	 */
	private function render_demo_data_tab() {
		$projects = wp_count_posts( 'portfolio_project' );
		$count    = $projects->publish ?? 0;
		$seeded   = has_demo_data();
		?>
		<div class="proportfolio-demo-section">
			<h2><?php esc_html_e( 'Demo Data Management', 'proportfolio-showcase' ); ?></h2>

			<p>
				<?php
				printf(
				/* translators: %d: number of published projects */
					esc_html__( 'You currently have %d published portfolio projects.', 'proportfolio-showcase' ),
					esc_html( $count )
				);
				?>
			</p>

			<?php if ( $seeded ) : ?>
				<div class="notice notice-success inline">
					<p><?php esc_html_e( 'Demo data has been seeded and is active.', 'proportfolio-showcase' ); ?></p>
				</div>

				<form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" style="margin-top: 16px;">
					<?php wp_nonce_field( 'proportfolio_remove_demo_action', 'proportfolio_remove_demo_nonce' ); ?>
					<input type="hidden" name="action" value="proportfolio_remove_demo" />

					<p>
						<button type="submit" class="button button-secondary" onclick="return confirm('<?php echo esc_js( __( 'Are you sure you want to remove all demo projects? This cannot be undone.', 'proportfolio-showcase' ) ); ?>');">
							<?php esc_html_e( 'Remove Demo Data', 'proportfolio-showcase' ); ?>
						</button>
					</p>
				</form>

			<?php else : ?>
				<p><?php esc_html_e( 'Click the button below to seed 6 demo portfolio projects with realistic data, categories, and meta fields. Great for testing and demonstration.', 'proportfolio-showcase' ); ?></p>

				<form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post">
					<?php wp_nonce_field( 'proportfolio_seed_demo_action', 'proportfolio_seed_demo_nonce' ); ?>
					<input type="hidden" name="action" value="proportfolio_seed_demo" />

					<p>
						<button type="submit" class="button button-primary">
							<?php esc_html_e( 'Seed Demo Projects', 'proportfolio-showcase' ); ?>
						</button>
					</p>
				</form>
			<?php endif; ?>
		</div>
		<?php
	}

	/**
	 * Render the Help tab.
	 *
	 * @return void
	 */
	private function render_help_tab() {
		?>
		<div class="proportfolio-help-section">
			<h2><?php esc_html_e( 'How to Use ProPortfolio Showcase', 'proportfolio-showcase' ); ?></h2>

			<div style="max-width: 700px;">
				<h3><?php esc_html_e( 'Shortcodes', 'proportfolio-showcase' ); ?></h3>
				<table class="widefat striped" style="margin-bottom: 24px;">
					<thead>
						<tr>
							<th><?php esc_html_e( 'Shortcode', 'proportfolio-showcase' ); ?></th>
							<th><?php esc_html_e( 'Description', 'proportfolio-showcase' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><code>[proportfolio_grid count="6" columns="3" category="" show_filter="true"]</code></td>
							<td><?php esc_html_e( 'Display a responsive grid of portfolio projects.', 'proportfolio-showcase' ); ?></td>
						</tr>
						<tr>
							<td><code>[proportfolio_single id="123"]</code></td>
							<td><?php esc_html_e( 'Display a single project by ID.', 'proportfolio-showcase' ); ?></td>
						</tr>
					</tbody>
				</table>

				<h3><?php esc_html_e( 'Gutenberg Block', 'proportfolio-showcase' ); ?></h3>
				<p><?php esc_html_e( 'Search for the "Portfolio Grid" block in the block inserter (under the Widgets category). Add it to any post or page and configure via the block settings panel.', 'proportfolio-showcase' ); ?></p>

				<h3><?php esc_html_e( 'Widget', 'proportfolio-showcase' ); ?></h3>
				<p><?php esc_html_e( 'Add "ProPortfolio Recent Projects" to any widget area from Appearance → Widgets.', 'proportfolio-showcase' ); ?></p>

				<h3><?php esc_html_e( 'REST API', 'proportfolio-showcase' ); ?></h3>
				<p><?php esc_html_e( 'The plugin exposes a custom REST API endpoint:', 'proportfolio-showcase' ); ?></p>
				<code><?php echo esc_url( rest_url( 'proportfolio/v1/projects' ) ); ?></code>
				<p style="margin-top: 8px;">
					<?php esc_html_e( 'Supports pagination (?per_page=10&page=1), category filtering (?category=ID), featured filter (?featured=true), technology search (?technology=React), and text search (?search=election).', 'proportfolio-showcase' ); ?>
				</p>

				<h3><?php esc_html_e( 'Template Overrides', 'proportfolio-showcase' ); ?></h3>
				<p>
					<?php esc_html_e( 'Copy these files to your theme to override plugin templates:', 'proportfolio-showcase' ); ?>
				</p>
				<ul>
					<li><code>templates/single-portfolio_project.php</code> → <code>theme/single-portfolio_project.php</code></li>
					<li><code>templates/archive-portfolio_project.php</code> → <code>theme/archive-portfolio_project.php</code></li>
				</ul>
			</div>
		</div>
		<?php
	}

	/**
	 * Render a text field for settings.
	 *
	 * @param array $args Field configuration.
	 * @return void
	 */
	public function render_text_field( $args ) {
		$options     = get_portfolio_options();
		$value       = isset( $options[ $args['option'] ] ) ? $options[ $args['option'] ] : '';
		$description = isset( $args['description'] ) ? $args['description'] : '';
		?>
		<input
			type="text"
			id="<?php echo esc_attr( $args['label_for'] ); ?>"
			name="proportfolio_options[<?php echo esc_attr( $args['option'] ); ?>]"
			value="<?php echo esc_attr( $value ); ?>"
			class="regular-text"
		/>
		<?php if ( $description ) : ?>
			<p class="description"><?php echo esc_html( $description ); ?></p>
		<?php endif; ?>
		<?php
	}

	/**
	 * Render a number field for settings.
	 *
	 * @param array $args Field configuration.
	 * @return void
	 */
	public function render_number_field( $args ) {
		$options = get_portfolio_options();
		$value   = isset( $options[ $args['option'] ] ) ? $options[ $args['option'] ] : '';
		$min     = isset( $args['min'] ) ? $args['min'] : 0;
		$max     = isset( $args['max'] ) ? $args['max'] : 999;
		?>
		<input
			type="number"
			id="<?php echo esc_attr( $args['label_for'] ); ?>"
			name="proportfolio_options[<?php echo esc_attr( $args['option'] ); ?>]"
			value="<?php echo esc_attr( $value ); ?>"
			class="small-text"
			min="<?php echo esc_attr( $min ); ?>"
			max="<?php echo esc_attr( $max ); ?>"
		/>
		<?php
	}

	/**
	 * Sanitize plugin settings.
	 *
	 * @param array $input Raw input values.
	 * @return array Sanitized values.
	 */
	public function sanitize_settings( $input ) {
		$sanitized = array();

		$sanitized['archive_heading']    = isset( $input['archive_heading'] ) ? sanitize_text_field( $input['archive_heading'] ) : '';
		$sanitized['projects_per_page']  = isset( $input['projects_per_page'] ) ? absint( $input['projects_per_page'] ) : 12;
		$sanitized['cpt_rewrite_slug']   = isset( $input['cpt_rewrite_slug'] ) ? sanitize_title( $input['cpt_rewrite_slug'] ) : 'portfolio';

		// Clamp.
		if ( $sanitized['projects_per_page'] < 1 ) {
			$sanitized['projects_per_page'] = 1;
		}
		if ( $sanitized['projects_per_page'] > 100 ) {
			$sanitized['projects_per_page'] = 100;
		}

		return $sanitized;
	}

	/**
	 * Handle the "Seed Demo Data" admin action.
	 *
	 * @return void
	 */
	public function handle_seed_demo() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Unauthorized.', 'proportfolio-showcase' ) );
		}

		if ( ! isset( $_POST['proportfolio_seed_demo_nonce'] )
			|| ! wp_verify_nonce( sanitize_key( $_POST['proportfolio_seed_demo_nonce'] ), 'proportfolio_seed_demo_action' ) ) {
			wp_die( esc_html__( 'Security check failed.', 'proportfolio-showcase' ) );
		}

		$demo   = new Demo_Data();
		$result = $demo->seed();

		set_transient( 'proportfolio_admin_message', $result, 30 );

		wp_safe_redirect(
			add_query_arg(
				array(
					'page' => 'proportfolio',
					'tab'  => 'demo-data',
				),
				admin_url( 'admin.php' )
			)
		);
		exit;
	}

	/**
	 * Handle the "Remove Demo Data" admin action.
	 *
	 * @return void
	 */
	public function handle_remove_demo() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Unauthorized.', 'proportfolio-showcase' ) );
		}

		if ( ! isset( $_POST['proportfolio_remove_demo_nonce'] )
			|| ! wp_verify_nonce( sanitize_key( $_POST['proportfolio_remove_demo_nonce'] ), 'proportfolio_remove_demo_action' ) ) {
			wp_die( esc_html__( 'Security check failed.', 'proportfolio-showcase' ) );
		}

		$demo   = new Demo_Data();
		$result = $demo->remove();

		set_transient( 'proportfolio_admin_message', $result, 30 );

		wp_safe_redirect(
			add_query_arg(
				array(
					'page' => 'proportfolio',
					'tab'  => 'demo-data',
				),
				admin_url( 'admin.php' )
			)
		);
		exit;
	}

	/**
	 * Display admin notices.
	 *
	 * @return void
	 */
	public function admin_notices() {
		// Setup wizard notice.
		if ( get_transient( 'proportfolio_show_setup_wizard' ) ) {
			$screen = get_current_screen();
			if ( $screen && 'dashboard' === $screen->id ) {
				?>
				<div class="notice notice-info is-dismissible">
					<p>
						<?php esc_html_e( 'Welcome to ProPortfolio Showcase! Get started by adding demo data or configuring your settings.', 'proportfolio-showcase' ); ?>
						<a href="<?php echo esc_url( admin_url( 'admin.php?page=proportfolio&tab=demo-data' ) ); ?>">
							<?php esc_html_e( 'Go to Demo Data', 'proportfolio-showcase' ); ?>
						</a>
					</p>
				</div>
				<?php
			}
		}

		// Admin action result messages.
		$message = get_transient( 'proportfolio_admin_message' );
		if ( $message && isset( $message['message'] ) ) {
			$notice_class = ! empty( $message['success'] ) ? 'notice-success' : 'notice-warning';
			?>
			<div class="notice <?php echo esc_attr( $notice_class ); ?> is-dismissible">
				<p><?php echo esc_html( $message['message'] ); ?></p>
			</div>
			<?php
		}
	}

	/**
	 * Add custom columns to the portfolio_project list table.
	 *
	 * @param array $columns Default columns.
	 * @return array Modified columns.
	 */
	public function add_custom_columns( $columns ) {
		$new_columns = array();

		// Insert after title (cb + title are the first two columns).
		$index = 0;
		foreach ( $columns as $key => $value ) {
			$new_columns[ $key ] = $value;
			if ( 'title' === $key ) {
				$new_columns['proportfolio_thumbnail'] = __( 'Thumbnail', 'proportfolio-showcase' );
				$new_columns['proportfolio_client']    = __( 'Client', 'proportfolio-showcase' );
				$new_columns['proportfolio_technologies'] = __( 'Technologies', 'proportfolio-showcase' );
				$new_columns['proportfolio_featured']  = __( 'Featured', 'proportfolio-showcase' );
			}
		}

		return $new_columns;
	}

	/**
	 * Render custom column content.
	 *
	 * @param string $column  Column identifier.
	 * @param int    $post_id Post ID.
	 * @return void
	 */
	public function custom_column_content( $column, $post_id ) {
		switch ( $column ) {
			case 'proportfolio_thumbnail':
				if ( has_post_thumbnail( $post_id ) ) {
					echo get_the_post_thumbnail( $post_id, 'thumbnail', array( 'style' => 'max-width: 60px; height: auto;' ) );
				} else {
					echo '<span aria-hidden="true">—</span>';
				}
				break;

			case 'proportfolio_client':
				$client = get_post_meta( $post_id, 'project_client', true );
				echo esc_html( $client ?: '—' );
				break;

			case 'proportfolio_technologies':
				$technologies = get_post_meta( $post_id, 'project_technologies', true );
				if ( is_array( $technologies ) && ! empty( $technologies ) ) {
					echo esc_html( implode( ', ', array_slice( $technologies, 0, 3 ) ) );
					if ( count( $technologies ) > 3 ) {
						echo esc_html( ' +' . ( count( $technologies ) - 3 ) );
					}
				} else {
					echo '<span aria-hidden="true">—</span>';
				}
				break;

			case 'proportfolio_featured':
				$featured = get_post_meta( $post_id, 'project_featured', true );
				if ( $featured ) {
					echo '<span style="color: #f0b849; font-size: 1.2em;">★</span>';
					echo '<span class="screen-reader-text">' . esc_html__( 'Featured', 'proportfolio-showcase' ) . '</span>';
				} else {
					echo '<span aria-hidden="true">—</span>';
				}
				break;
		}
	}

	/**
	 * Make custom columns sortable.
	 *
	 * @param array $columns Sortable columns.
	 * @return array Modified columns.
	 */
	public function add_sortable_columns( $columns ) {
		$columns['proportfolio_client'] = 'proportfolio_client';
		return $columns;
	}
}