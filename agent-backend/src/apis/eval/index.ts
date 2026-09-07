import { Hono } from 'hono';
import datasets from './datasets.ts';
import judgeDimensions from './judge-dimensions.ts';
import runs from './runs.ts';

const evaluation = new Hono();

evaluation.route('/datasets', datasets);
evaluation.route('/judge-dimensions', judgeDimensions);
evaluation.route('/runs', runs);

export default evaluation;
