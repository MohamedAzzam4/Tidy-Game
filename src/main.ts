import './style.css';
import { houseLevel } from './level/house.level';
import { parseSeedParam } from './game/scatter';
import { initGameView } from './view/gameView';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app root element missing');
initGameView(root, houseLevel, parseSeedParam(new URLSearchParams(window.location.search).get('seed')));
