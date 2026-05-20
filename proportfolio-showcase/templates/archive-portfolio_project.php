<?php
/**
 * Archive template for portfolio projects.
 *
 * Used when the active theme does not provide archive-portfolio_project.php.
 *
 * @package ProPortfolio_Showcase
 */

defined( 'ABSPATH' ) || exit;

get_header(); ?>

<main id="primary" class="site-main" role="main">
	<header class="page-header">
		<?php
		if ( is_tax( 'project_category' ) ) {
			$term = get_queried_object();
			if ( $term && isset( $term->name ) ) {
				printf(
					'<h1 class="page-title">%s</h1>',
					esc_html( $term->name )
				);
				if ( ! empty( $term->description ) ) {
					printf(
						'<div class="archive-description">%s</div>',
						wp_kses_post( wpautop( $term->description ) )
					);
				}
			}
		} else {
			$archive_heading = \ProPortfolio\Includes\get_portfolio_options( 'archive_heading' );
			?>
			<h1 class="page-title"><?php echo esc_html( $archive_heading ); ?></h1>
			<?php
		}
		?>
	</header>

	<?php if ( have_posts() ) : ?>
		<div class="proportfolio-archive-grid" style="--columns: 3;">
			<?php
			while ( have_posts() ) :
				the_post();
				$post_id      = get_the_ID();
				$technologies = get_post_meta( $post_id, 'project_technologies', true );
				$client       = get_post_meta( $post_id, 'project_client', true );
				$completion   = get_post_meta( $post_id, 'project_completion_date', true );
				?>
				<article id="post-<?php the_ID(); ?>" <?php post_class( 'proportfolio-card' ); ?> itemscope itemtype="https://schema.org/CreativeWork">
					<a href="<?php the_permalink(); ?>" class="proportfolio-card-link">
						<figure class="proportfolio-card-image">
							<?php if ( has_post_thumbnail() ) : ?>
								<?php the_post_thumbnail( 'medium_large', array( 'loading' => 'lazy', 'itemprop' => 'image' ) ); ?>
							<?php else : ?>
								<img
									src="<?php echo esc_url( \ProPortfolio\Includes\get_placeholder_thumbnail( $post_id ) ); ?>"
									alt="<?php echo esc_attr( sprintf( __( 'Placeholder image for %s', 'proportfolio-showcase' ), get_the_title() ) ); ?>"
									loading="lazy"
								/>
							<?php endif; ?>
						</figure>

						<figcaption class="proportfolio-card-content">
							<h2 itemprop="name"><?php the_title(); ?></h2>

							<?php if ( has_excerpt() ) : ?>
								<p itemprop="description"><?php echo esc_html( get_the_excerpt() ); ?></p>
							<?php endif; ?>

							<footer class="proportfolio-card-meta">
								<?php if ( $client ) : ?>
									<span class="project-client" itemprop="client"><?php echo esc_html( $client ); ?></span>
								<?php endif; ?>

								<?php if ( $completion ) : ?>
									<time datetime="<?php echo esc_attr( $completion ); ?>" itemprop="dateCreated">
										<?php echo esc_html( gmdate( 'M Y', strtotime( $completion ) ) ); ?>
									</time>
								<?php endif; ?>
							</footer>

							<?php if ( ! empty( $technologies ) && is_array( $technologies ) ) : ?>
								<ul class="project-technologies" aria-label="<?php esc_attr_e( 'Technologies used', 'proportfolio-showcase' ); ?>">
									<?php foreach ( array_slice( $technologies, 0, 3 ) as $tech ) : ?>
										<li><?php echo esc_html( $tech ); ?></li>
									<?php endforeach; ?>
									<?php if ( count( $technologies ) > 3 ) : ?>
										<li class="tech-more">+<?php echo esc_html( count( $technologies ) - 3 ); ?></li>
									<?php endif; ?>
								</ul>
							<?php endif; ?>
						</figcaption>
					</a>
				</article>
			<?php endwhile; ?>
		</div>

		<nav class="proportfolio-pagination" aria-label="<?php esc_attr_e( 'Portfolio pagination', 'proportfolio-showcase' ); ?>">
			<?php
			the_posts_pagination(
				array(
					'mid_size'  => 2,
					'prev_text' => sprintf(
						'<span aria-hidden="true">&laquo;</span><span class="screen-reader-text">%s</span>',
						__( 'Previous page', 'proportfolio-showcase' )
					),
					'next_text' => sprintf(
						'<span aria-hidden="true">&raquo;</span><span class="screen-reader-text">%s</span>',
						__( 'Next page', 'proportfolio-showcase' )
					),
				)
			);
			?>
		</nav>
	<?php else : ?>
		<div class="proportfolio-no-results">
			<p><?php esc_html_e( 'No portfolio projects found.', 'proportfolio-showcase' ); ?></p>
			<?php get_search_form(); ?>
		</div>
	<?php endif; ?>
</main>

<?php
get_footer();