import type { QuizQuestion } from '../types';
import { languageQuestions } from './language';
import { logicQuestions } from './logic';
import { popCultureQuestions } from './pop-culture';
import { artsQuestions } from './arts';
import { literatureQuestions } from './literature';
import { geographyQuestions } from './geography';
import { indiaQuestions } from './india';
import { historyQuestions } from './history';
import { scienceQuestions } from './science';
import { natureQuestions } from './nature';
import { foodQuestions } from './food';
import { sportQuestions } from './sport';
import { animalsQuestions } from './animals';
import { animeQuestions } from './anime';
import { footballQuestions } from './football';
import { moviesQuestions } from './movies';
import { technologyQuestions } from './technology';
import { womenQuestions } from './women';

// One bank for every game. Add questions to the category file they belong in.
export const quizQuestions: QuizQuestion[] = [
    ...languageQuestions,
    ...logicQuestions,
    ...popCultureQuestions,
    ...artsQuestions,
    ...literatureQuestions,
    ...geographyQuestions,
    ...indiaQuestions,
    ...historyQuestions,
    ...scienceQuestions,
    ...natureQuestions,
    ...foodQuestions,
    ...sportQuestions,
    ...animalsQuestions,
    ...animeQuestions,
    ...footballQuestions,
    ...moviesQuestions,
    ...technologyQuestions,
    ...womenQuestions,
];
