export const state = () => ({
  event: '',
  data: {},
  submissionsPreview: [],
  submissions: [],
})

export const mutations = {
  setEvent(state, event) {
    state.event = event
  },
  setData(state, data) {
    state.data = data
  },
  setSubmissionPreview(state, submissions) {
    state.submissionsPreview = submissions
  },
  setSubmissions(state, submissions) {
    state.submissions = submissions
  },
}

export const actions = {
  async getEventData({ commit, dispatch, state }, { event, submissions }) {
    if (event !== state.event) {
      commit('setEvent', event)
      commit('setData', {})
      commit('setSubmissionPreview', [])

      await dispatch('getEventDetails')
      await dispatch('getSubmissionsPreview')
    }

    // We only want to get all submissions if we are on the submissions page
    // Otherwise it's too many calls to the firestore
    if (
      submissions &&
      (state.submissions.length === 0 || event !== state.event)
    ) {
      await dispatch('getSubmissions')
    }
  },
  async submitSignup({ rootState }, data) {
    const eventRef = this.$fire.firestore.collection('events').doc(data.event)

    // Add the user to the event document so that we have less firestore calls to retrieve users
    await this.$fire.firestore.runTransaction(async (t) => {
      const event = (await t.get(eventRef)).data()

      const usersData = event?.usersData || []

      await t.set(
        eventRef,
        {
          usersData: [
            ...usersData,
            {
              uid: data.user,
              avatar_url: rootState.user.data.avatar_url,
              name: rootState.user.data.name,
              html_url: rootState.user.data.html_url,
            },
          ],
        },
        {
          merge: true,
        }
      )
    })

    return await this.$fire.firestore.collection('signups').add(data)
  },
  async submitProject({ state, commit }, data) {
    if (data.image) {
      await this.$fire.storage
        .ref()
        .child(data.event + '/' + data.repoId + data.user + data.image.name)
        .put(data.image)
        .then((snapshot) => snapshot.ref.getDownloadURL())
        .then((downloadURL) => {
          data.image = downloadURL
        })
    } else {
      data.image = ''
    }

    // Keep track of the submissions count so we don't have to calculate it
    // This reduces the number of calls made to firestore on the event pages
    const submissionRef = await this.$fire.firestore
      .collection('events')
      .doc(data.event)

    await this.$fire.firestore.runTransaction(async (t) => {
      const submission = (await t.get(submissionRef)).data()

      await t.set(
        submissionRef,
        {
          submissionsCount: (submission.submissionsCount || 0) + 1,
        },
        {
          merge: true,
        }
      )
    })

    return await this.$fire.firestore.collection('submissions').add(data)
  },

  async getEventDetails({ state, commit }) {
    await this.$fire.firestore
      .collection('events')
      .doc(state.event)
      .onSnapshot((doc) => {
        commit('setData', doc.data())
      })
  },
  async getSubmissionsPreview({ state, commit }) {
    await this.$fire.firestore
      .collection('submissions')
      .where('event', '==', state.event)
      .limit(3)
      .onSnapshot((submissions) => {
        const submissionsList = []

        submissions.forEach((doc) => {
          submissionsList.push({ ...doc.data(), uid: doc.id })
        })

        commit('setSubmissionPreview', submissionsList)
      })
  },
  async getSubmissions({ state, commit }) {
    await this.$fire.firestore
      .collection('submissions')
      .where('event', '==', state.event)
      .onSnapshot((submissions) => {
        const submissionsList = []

        submissions.forEach((doc) => {
          submissionsList.push({ ...doc.data(), uid: doc.id })
        })

        commit('setSubmissions', submissionsList)
      })
  },
  async updateEventUsers(ctx) {
    const eventData = await this.$fire.firestore
      .collection('events')
      .where('users', 'array-contains', ctx.rootState.user.data.uid)
      .get()

    eventData.forEach((doc) => {
      const usersData = doc.data().usersData
      const userIndex = usersData.findIndex(
        ({ uid }) => uid === ctx.rootState.user.data.uid
      )
      usersData[userIndex] = {
        uid: ctx.rootState.user.data.uid,
        avatar_url: ctx.rootState.user.data.avatar_url,
        name: ctx.rootState.user.data.name,
        login: ctx.rootState.user.data.login,
        html_url: ctx.rootState.user.data.html_url,
      }

      this.$fire.firestore.collection('events').doc(doc.id).update({
        usersData,
      })
    })
  },
}
