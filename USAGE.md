# Run tests with GitHub Actions

"Run on Testkube" is a GitHub Action for running tests on the Testkube platform.

Use it to run tests and test suites and obtain results directly in the GitHub's workflow.

## Table of content

1. [Usage](#usage)
   1. [Testkube Cloud](#testkube-cloud)
   2. [Self-hosted instance](#self-hosted-instance)
   3. [Examples](#examples)
      1. [Run test on self-hosted instance](#run-test-on-self-hosted-instance)
      2. [Run test suite on self-hosted instance](#run-test-suite-on-self-hosted-instance)
      3. [Run tests from local repository for the PR](#run-tests-from-local-repository-for-the-pr)
      4. [Run tests with custom environment variables](#run-tests-with-custom-environment-variables)
2. [Inputs](#inputs)
   1. [Test](#test)
   2. [Test Suite](#test-suite)
   3. [Cloud and Enterprise](#cloud-and-enterprise)
   4. [Own instance](#own-instance)

## Usage

To use the action in your GitHub workflow, use `kubeshop/testkube-run-action@v1` action.
The configuration options are described in the [**Inputs**](#inputs) section, and may vary depending on the Testkube solution you are using ([**cloud**](#cloud) or [**self-hosted**](#self-hosted-instance)) and your needs.

The most important options you will need are `test` and `testSuite` - you should pass a test or test suite name there.

### Testkube Cloud

To use this GitHub Action for the [**Testkube Cloud**](https://app.testkube.io), you need to [**create API token**](https://docs.testkube.io/testkube-cloud/organization-management#api-tokens).

Then, pass the `organization` and `environment` IDs for the test, along with the `token` and other parameters specific for your use case:

```yaml
uses: kubeshop/testkube-run-action@v1
with:
  # Instance
  organization: tkcorg_0123456789abcdef
  environment: tkcenv_fedcba9876543210
  token: tkcapi_0123456789abcdef0123456789abcd
  # Options
  test: some-test-id-to-run
```

It will be probably unsafe to keep directly in the workflow's YAML configuration, so you may want to use [**Github's secrets**](https://docs.github.com/en/actions/security-guides/encrypted-secrets) instead.

```yaml
uses: kubeshop/testkube-run-action@v1
with:
  # Instance
  organization: ${{ secrets.TkOrganization }}
  environment: ${{ secrets.TkEnvironment }}
  token: ${{ secrets.TkToken }}
  # Options
  test: some-test-id-to-run
```

### Self-hosted instance

To run the test on self-hosted instance, simply pass `url` that points to the API, i.e.:

```yaml
uses: kubeshop/testkube-run-action@v1
with:
  # Instance
  url: https://demo.testkube.io/results/v1
  # Options
  test: some-test-id-to-run
```

### Examples

#### Run test on self-hosted instance

```yaml
uses: kubeshop/testkube-run-action@v1
with:
  url: https://demo.testkube.io/results/v1
  test: container-executor-curl-smoke
```

#### Run test suite on self-hosted instance

```yaml
uses: kubeshop/testkube-run-action@v1
with:
  url: https://demo.testkube.io/results/v1
  testSuite: executor-soapui-smoke-tests
```

#### Run tests from local repository for the PR

```yaml
uses: kubeshop/testkube-run-action@v1
with:
  organization: ${{ secrets.TkOrganization }}
  environment: ${{ secrets.TkEnvironment }}
  token: ${{ secrets.TkToken }}
  test: e2e-dashboard-tests
  ref: ${{ github.head_ref }}
```

#### Run tests with custom environment variables

```yaml
uses: kubeshop/testkube-run-action@v1
with:
  organization: ${{ secrets.TkOrganization }}
  environment: ${{ secrets.TkEnvironment }}
  token: ${{ secrets.TkToken }}
  test: e2e-dashboard-tests
  variables: |
    URL="https://some.domain.com"
    EXECUTED_FROM="${{ github.head_ref }}"
  secretVariables: |
    SOME_SECRET_ENV="abc"
    OTHER_ENV="${{ secrets.ExternalToken }}"
```

## Inputs

There are different inputs available for tests and test suites, as well as for Cloud and own instance.

### Test

| Required | Name              | Description                                                                                                                                                     |
|:--------:|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
|    ✓     | `test`            | Test name in the Testkube environment                                                                                                                           |
|    ✗     | `ref`             | Override [**Git reference (branch, commit, tag)**](https://docs.testkube.io/concepts/tests/tests-creating/#create-a-test-from-git) for the test                 |
|    ✗     | `preRunScript`    | Override [**pre-run script**](https://docs.testkube.io/concepts/tests/tests-creating/#executing-a-prerun-script) for the test                                   |
|    ✗     | `variables`       | [**Basic variables**](https://docs.testkube.io/concepts/tests/tests-variables/) in the [**dotenv format**](https://hexdocs.pm/dotenvy/dotenv-file-format.html)  |
|    ✗     | `secretVariables` | [**Secret variables**](https://docs.testkube.io/concepts/tests/tests-variables/) in the [**dotenv format**](https://hexdocs.pm/dotenvy/dotenv-file-format.html) |
|    ✗     | `executionName`   | Override execution name, so you may i.e. mention the PR                                                                                                         |
|    ✗     | `namespace`       | Set namespace to run test in                                                                                                                                    |

### Test suite

| Required | Name              | Description                                                                                                                                                     |
|:--------:|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
|    ✓     | `testSuite`       | Test suite name in the Testkube environment                                                                                                                     |
|    ✗     | `variables`       | [**Basic variables**](https://docs.testkube.io/concepts/tests/tests-variables/) in the [**dotenv format**](https://hexdocs.pm/dotenvy/dotenv-file-format.html)  |
|    ✗     | `secretVariables` | [**Secret variables**](https://docs.testkube.io/concepts/tests/tests-variables/) in the [**dotenv format**](https://hexdocs.pm/dotenvy/dotenv-file-format.html) |
|    ✗     | `executionName`   | Override execution name, so you may i.e. mention the PR                                                                                                         |
|    ✗     | `namespace`       | Set namespace to run test suite in                                                                                                                              |

### Cloud and Enterprise

| Required | Name           | Description                                                                                                                                                                                                                               |
|:--------:|----------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|    ✓     | `organization` | The organization ID from Testkube Cloud or Enterprise - it starts with `tkc_org`, you may find it i.e. in the dashboard's URL                                                                                                             |
|    ✓     | `environment`  | The environment ID from Testkube Cloud or Enterprise - it starts with `tkc_env`, you may find it i.e. in the dashboard's URL                                                                                                              |
|    ✓     | `token`        | API token that has at least a permission to run specific test or test suite. You may read more about [**creating API token**](https://docs.testkube.io/testkube-cloud/organization-management#api-tokens) in Testkube Cloud or Enterprise |
|    ✗     | `url`          | URL of the Testkube Enterprise instance, if applicable                                                                                                                                                                                    |
|    ✗     | `dashboardUrl` | URL of the Testkube Enterprise dashboard, if applicable, to display links for the execution                                                                                                                                               |

### Own instance

| Required | Name           | Description                                                                                          |
|:--------:|----------------|------------------------------------------------------------------------------------------------------|
|    ✓     | `url`          | URL for the API of the own Testkube instance                                                         |
|    ✗     | `ws`           | Override WebSocket API URL of the own Testkube instance (use it only if auto-detection doesn't work) |
|    ✗     | `dashboardUrl` | URL for the Dashboard of the own Testkube instance, to display links for the execution               |
