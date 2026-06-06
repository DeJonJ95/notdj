<?php
/**
 * Single portfolio project template.
 *
 * Used when the active theme does not provide single-portfolio_project.php.
 *
 * @package ProPortfolio_Showcase
 */

defined( 'ABSPATH' ) || exit;

get_header(); ?>

<main id="primary" class="site-main" role="main">
	<?php
	while ( have_posts() ) :
		the_post();

		$post_id            = get_the_ID();
		$client             = get_post_meta( $post_id, 'project_client', true );
		$completion_date    = get_post_meta( $post_id, 'project_completion_date', true );
		$technologies       = get_post_meta( $post_id, 'project_technologies', true );
		$project_url        = get_post_meta( $post_id, 'project_url', true );
		$testimonial        = get_post_meta( $post_id, 'project_testimonial', true );
		$testimonial_author = get_post_meta( $post_id, 'project_testimonial_author', true );
		$terms              = wp_get_post_terms( $post_id, 'project_category', array( 'fields' => 'all' ) );
		?>
		<article id="post-<?php the_ID(); ?>" <?php post_class( 'proportfolio-single' ); ?> itemscope itemtype="https://schema.org/CreativeWork">
			<header class="entry-header proportfolio-single-header">
				<?php the_title( '<h1 class="entry-title" itemprop="name">', '</h1>' ); ?>

				<div class="proportfolio-meta-bar">
					<?php if ( $client ) : ?>
						<span class="project-client" itemprop="client">
							<?php esc_html_e( 'Client:', 'proportfolio-showcase' ); ?>
							<strong><?php echo esc_html( $client ); ?></strong>
						</span>
					<?php endif; ?>

					<?php if ( $completion_date ) : ?>
						<time class="project-date" datetime="<?php echo esc_attr( $completion_date ); ?>" itemprop="dateCreated">
							<?php echo esc_html( gmdate( 'F Y', strtotime( $completion_date ) ) ); ?>
						</time>
					<?php endif; ?>

					<?php if ( ! empty( $terms ) && ! is_wp_error( $terms ) ) : ?>
						<span class="project-categories">
							<?php
							$term_links = array();
							foreach ( $terms as $term ) {
								$term_links[] = sprintf(
									'<a href="%s" rel="tag">%s</a>',
									esc_url( get_term_link( $term ) ),
									esc_html( $term->name )
								);
							}
							echo wp_kses(
								implode( ', ', $term_links ),
								array( 'a' => array( 'href' => array(), 'rel' => array() ) )
							);
							?>
						</span>
					<?php endif; ?>
				</div>
			</header>

			<div class="proportfolio-single-content">
				<?php if ( has_post_thumbnail() ) : ?>
					<figure class="proportfolio-featured-image">
						<?php the_post_thumbnail( 'large', array( 'loading' => 'lazy', 'itemprop' => 'image' ) ); ?>
					</figure>
				<?php endif; ?>

				<div class="entry-content" itemprop="description">
					<?php the_content(); ?>
				</div>

				<?php if ( ! empty( $technologies ) && is_array( $technologies ) ) : ?>
					<section class="proportfolio-technologies-section" aria-label="<?php esc_attr_e( 'Technologies used', 'proportfolio-showcase' ); ?>">
						<h2><?php esc_html_e( 'Technologies Used', 'proportfolio-showcase' ); ?></h2>
						<ul class="proportfolio-tech-list">
							<?php foreach ( $technologies as $tech ) : ?>
								<li><?php echo esc_html( $tech ); ?></li>
							<?php endforeach; ?>
						</ul>
					</section>
				<?php endif; ?>

				<?php if ( ! empty( $testimonial ) ) : ?>
					<aside class="proportfolio-testimonial" aria-label="<?php esc_attr_e( 'Client testimonial', 'proportfolio-showcase' ); ?>">
						<blockquote>
							<p><?php echo esc_html( $testimonial ); ?></p>
							<?php if ( ! empty( $testimonial_author ) ) : ?>
								<cite>&mdash; <?php echo esc_html( $testimonial_author ); ?></cite>
							<?php endif; ?>
						</blockquote>
					</aside>
				<?php endif; ?>
			</div>

			<footer class="proportfolio-single-footer">
				<?php if ( $project_url ) : ?>
					<a href="<?php echo esc_url( $project_url ); ?>" class="button proportfolio-button" target="_blank" rel="noopener noreferrer">
						<?php esc_html_e( 'View Live Project', 'proportfolio-showcase' ); ?>
					</a>
				<?php endif; ?>

				<nav class="proportfolio-post-navigation" aria-label="<?php esc_attr_e( 'Project navigation', 'proportfolio-showcase' ); ?>">
					<div class="nav-previous">
						<?php previous_post_link( '%link', '&laquo; %title', true, '', 'project_category' ); ?>
					</div>
					<div class="nav-next">
						<?php next_post_link( '%link', '%title &raquo;', true, '', 'project_category' ); ?>
					</div>
				</nav>
			</footer>
		</article>
	<?php endwhile; ?>
</main>

<?php
get_footer();